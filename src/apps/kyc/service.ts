import "server-only";
import type { CurrentUser } from "@/platform/authz";
import { assertPermission, ConflictError, ForbiddenError } from "@/platform/authz";
import type { Prisma } from "@prisma/client";
import { mutate, scopedDb, type MutationContext } from "@/platform/data";
import { approvalsFor, decideApproval, requestApproval } from "@/platform/approvals";
import { isKycAnalyst } from "./analysts";
import { KycInputError, type Recommendation } from "./input";

const ENTITY = "KycCase";
/** Maker-checker action: analyst recommends (maker), approver makes the final decision (checker). */
export const FINAL_DECISION = "kyc_case.final_decision";
const FINAL_STATUSES = new Set(["APPROVED", "REJECTED"]);

type Tx = MutationContext["tx"];

/**
 * Compare-and-set on a case: applies `data` only if the row still matches `expected` (re-checked by Postgres
 * after waiting on any concurrent writer's row lock), else 409. Keeps check-then-update transitions atomic.
 */
async function claim(tx: Tx, expected: Prisma.KycCaseWhereInput & { id: string }, data: Prisma.KycCaseUpdateManyMutationInput) {
  const { count } = await tx.kycCase.updateMany({ where: expected, data });
  if (count !== 1) throw new ConflictError("Case was changed by someone else; reload and try again");
}

export async function listCases(user: CurrentUser) {
  return scopedDb(user).kycCase.findMany({ orderBy: { id: "asc" } });
}

/** 404 (NotFoundError) when the case does not exist or is outside the user's scope. */
export async function getCase(user: CurrentUser, id: string) {
  const db = scopedDb(user);
  const kycCase = await db.kycCase.findUniqueOrThrow({ where: { id } });
  const [notes, approvals] = await Promise.all([
    db.kycNote.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } }),
    approvalsFor(db, ENTITY, id),
  ]);
  return { case: kycCase, notes, approvals };
}

export async function addNote(user: CurrentUser, caseId: string, body: string) {
  assertPermission(user, "kyc:write");
  return mutate(user, async ({ tx, audit }) => {
    await tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    const note = await tx.kycNote.create({ data: { caseId, authorOid: user.oid, authorUsername: user.username, body } });
    await audit({ action: "kyc_case.add_note", entityType: ENTITY, entityId: caseId, after: note });
    return note;
  });
}

/** Maker step: only the assigned analyst, only on a SUBMITTED case. Creates the pending approval. */
export async function recommend(user: CurrentUser, caseId: string, recommendation: Recommendation, reason: string) {
  assertPermission(user, "kyc:write");
  return mutate(user, async (ctx) => {
    const before = await ctx.tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    if (before.assigneeOid !== user.oid) throw new ForbiddenError("Only the assigned analyst can recommend a decision");
    if (before.status !== "SUBMITTED") throw new ConflictError(`Cannot recommend on a ${before.status.toLowerCase()} case`);
    // Claim the SUBMITTED case first: the row lock serializes concurrent recommend/decide/reassign until commit.
    await claim(ctx.tx, { id: caseId, status: "SUBMITTED", assigneeOid: user.oid }, {
      status: "PENDING_APPROVAL",
      recommendation,
      recommendedByOid: user.oid,
      recommendationReason: reason || null,
    });
    await requestApproval(ctx, {
      entityType: ENTITY,
      entityId: caseId,
      action: FINAL_DECISION,
      comment: reason ? `${recommendation}: ${reason}` : recommendation,
    });
    const after = await ctx.tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    await ctx.audit({ action: "kyc_case.recommend", entityType: ENTITY, entityId: caseId, before, after });
    return after;
  });
}

export async function reassign(user: CurrentUser, caseId: string, assigneeOid: string) {
  assertPermission(user, "kyc:approve");
  if (!isKycAnalyst(assigneeOid)) throw new KycInputError("Assignee must be a KYC analyst");
  return mutate(user, async ({ tx, audit }) => {
    const before = await tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    if (FINAL_STATUSES.has(before.status)) throw new ConflictError(`Cannot reassign a ${before.status.toLowerCase()} case`);
    if (before.assigneeOid === assigneeOid) throw new ConflictError("Case is already assigned to that analyst");
    await claim(tx, { id: caseId, status: before.status, assigneeOid: before.assigneeOid }, { assigneeOid });
    const after = await tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    await audit({ action: "kyc_case.reassign", entityType: ENTITY, entityId: caseId, before, after });
    return after;
  });
}

/** Checker step: final approve/reject. Never by the user who recommended (also enforced by decideApproval + DB CHECK). */
export async function decide(user: CurrentUser, caseId: string, decision: Recommendation, comment: string) {
  assertPermission(user, "kyc:approve");
  return mutate(user, async (ctx) => {
    const before = await ctx.tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    if (before.recommendedByOid === user.oid) throw new ForbiddenError("You cannot decide a case you recommended");
    if (before.status !== "PENDING_APPROVAL") throw new ConflictError(`Cannot decide a ${before.status.toLowerCase()} case`);
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await claim(ctx.tx, { id: caseId, status: "PENDING_APPROVAL" }, { status });
    const pending = await ctx.tx.approval.findFirst({
      where: { entityType: ENTITY, entityId: caseId, action: FINAL_DECISION, status: "PENDING" },
    });
    if (!pending) throw new ConflictError("No pending recommendation for this case");
    await decideApproval(ctx, { approvalId: pending.id, decision: status, comment, requiredPermission: "kyc:approve" });
    const after = await ctx.tx.kycCase.findUniqueOrThrow({ where: { id: caseId } });
    await ctx.audit({ action: `kyc_case.${decision.toLowerCase()}`, entityType: ENTITY, entityId: caseId, before, after });
    return after;
  });
}
