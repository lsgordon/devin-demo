import "server-only";
import type { Prisma, RefundReason, RefundStatus } from "@prisma/client";
import type { CurrentUser } from "@/platform/authz";
import { assertPermission, ConflictError, ForbiddenError } from "@/platform/authz";
import { mutate, scopedDb } from "@/platform/data";
import { approvalsFor, decideApproval, requestApproval } from "@/platform/approvals";

const ENTITY = "RefundRequest";
const APPROVAL_ACTION = "refund_request.approve";

/** Refunds at or below this amount are approved on creation; larger ones need maker-checker approval. */
export const AUTO_APPROVE_LIMIT_CENTS = 10_000;
const MAX_AMOUNT_CENTS = 100_000_000;

export const REFUND_STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"] as const satisfies readonly RefundStatus[];
export const REFUND_REASONS = ["DAMAGED", "NOT_RECEIVED", "DUPLICATE_CHARGE", "WRONG_ITEM", "OTHER"] as const satisfies readonly RefundReason[];

/** Invalid user input -> HTTP 400 (route handlers) / form error (actions). */
export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** "123", "123.4", "123.45" (dollars) -> integer cents, or null when not a valid amount. */
export function parseAmountCents(value: unknown): number | null {
  const s = str(value);
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export const formatCents = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- reads ----------

export type RefundFilters = { status?: string; reason?: string; q?: string; min?: string; max?: string };

function filterWhere(f: RefundFilters): Prisma.RefundRequestWhereInput {
  const status = str(f.status);
  const reason = str(f.reason);
  const q = str(f.q);
  const min = parseAmountCents(f.min);
  const max = parseAmountCents(f.max);
  // No filters on PII fields: they would let users without pii:read probe raw values.
  return {
    ...(isOneOf(REFUND_STATUSES, status) && { status }),
    ...(isOneOf(REFUND_REASONS, reason) && { reason }),
    ...(q && { orderId: { contains: q, mode: "insensitive" as const } }),
    ...((min !== null || max !== null) && {
      amountCents: { ...(min !== null && { gte: min }), ...(max !== null && { lte: max }) },
    }),
  };
}

export async function listRefunds(user: CurrentUser, filters: RefundFilters = {}) {
  const db = scopedDb(user);
  const where = filterWhere(filters);
  const [rows, groups] = await Promise.all([
    db.refundRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    db.refundRequest.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { amountCents: true } }),
  ]);
  const byStatus = Object.fromEntries(
    REFUND_STATUSES.map((s) => {
      const g = groups.find((x) => x.status === s);
      return [s, { count: g?._count._all ?? 0, amountCents: g?._sum.amountCents ?? 0 }];
    }),
  ) as Record<RefundStatus, { count: number; amountCents: number }>;
  const totals = {
    count: Object.values(byStatus).reduce((n, s) => n + s.count, 0),
    amountCents: Object.values(byStatus).reduce((n, s) => n + s.amountCents, 0),
    byStatus,
  };
  return { rows, totals };
}

/** 404 (NotFoundError) when the row does not exist or is outside the user's scope. */
export async function getRefund(user: CurrentUser, id: string) {
  const db = scopedDb(user);
  const refund = await db.refundRequest.findUniqueOrThrow({ where: { id } });
  const approvals = await approvalsFor(db, ENTITY, id);
  return { refund, approvals };
}

// ---------- writes ----------

export type CreateRefundInput = {
  orderId: string;
  customerEmail: string;
  cardLast4: string;
  amountCents: number;
  reason: RefundReason;
  note: string | null;
};

/** Validates untrusted input (form data or JSON). Throws ValidationError. */
export function parseCreateInput(raw: Record<string, unknown>): CreateRefundInput {
  const orderId = str(raw.orderId).toUpperCase();
  const customerEmail = str(raw.customerEmail).toLowerCase();
  const cardLast4 = str(raw.cardLast4);
  const amountCents = parseAmountCents(raw.amount);
  const reason = str(raw.reason);
  const note = str(raw.note);
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(orderId)) throw new ValidationError("Order id must be 3-40 letters, digits or dashes");
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new ValidationError("Customer email is invalid");
  if (!/^\d{4}$/.test(cardLast4)) throw new ValidationError("Card last 4 must be exactly 4 digits");
  if (amountCents === null || amountCents <= 0) throw new ValidationError("Amount must be a positive dollar amount (max 2 decimals)");
  if (amountCents > MAX_AMOUNT_CENTS) throw new ValidationError("Amount is too large");
  if (!isOneOf(REFUND_REASONS, reason)) throw new ValidationError("Reason is invalid");
  if (note.length > 500) throw new ValidationError("Note must be at most 500 characters");
  return { orderId, customerEmail, cardLast4, amountCents, reason, note: note || null };
}

/** Maker: create a refund request. ≤ AUTO_APPROVE_LIMIT_CENTS is approved immediately; above it opens an approval. */
export async function createRefund(user: CurrentUser, raw: Record<string, unknown>) {
  assertPermission(user, "refunds:write");
  const input = parseCreateInput(raw);
  const autoApproved = input.amountCents <= AUTO_APPROVE_LIMIT_CENTS;
  return mutate(user, async (ctx) => {
    const created = await ctx.tx.refundRequest.create({
      data: {
        ...input,
        status: autoApproved ? "APPROVED" : "PENDING_APPROVAL",
        autoApproved,
        createdByOid: user.oid,
        createdByUsername: user.username,
        decidedAt: autoApproved ? new Date() : null,
      },
    });
    await ctx.audit({ action: "refund_request.create", entityType: ENTITY, entityId: created.id, after: created });
    if (autoApproved) {
      await ctx.audit({ action: "refund_request.auto_approve", entityType: ENTITY, entityId: created.id, after: created });
    } else {
      await requestApproval(ctx, { entityType: ENTITY, entityId: created.id, action: APPROVAL_ACTION, comment: input.note ?? undefined });
    }
    return created;
  });
}

export function parseDecision(value: unknown): "APPROVED" | "REJECTED" {
  const d = str(value).toUpperCase();
  if (d !== "APPROVED" && d !== "REJECTED") throw new ValidationError("Decision must be APPROVED or REJECTED");
  return d;
}

/** Checker: approve or reject a pending refund. Never your own request (also enforced by decideApproval + DB CHECKs). */
export async function decideRefund(user: CurrentUser, id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  assertPermission(user, "refunds:approve");
  return mutate(user, async (ctx) => {
    const before = await ctx.tx.refundRequest.findUniqueOrThrow({ where: { id } });
    if (before.createdByOid === user.oid) throw new ForbiddenError("You cannot approve or reject your own refund request");
    if (before.status !== "PENDING_APPROVAL") throw new ConflictError(`Refund is already ${before.status.toLowerCase()}`);
    const pending = await ctx.tx.approval.findFirst({ where: { entityType: ENTITY, entityId: id, action: APPROVAL_ACTION, status: "PENDING" } });
    if (!pending) throw new ConflictError("No pending approval for this refund");
    await decideApproval(ctx, { approvalId: pending.id, decision, comment, requiredPermission: "refunds:approve" });
    const after = await ctx.tx.refundRequest.update({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: decision, decidedByOid: user.oid, decidedByUsername: user.username, decidedAt: new Date() },
    });
    await ctx.audit({ action: `refund_request.${decision === "APPROVED" ? "approve" : "reject"}`, entityType: ENTITY, entityId: id, before, after });
    return after;
  });
}
