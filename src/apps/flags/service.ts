import "server-only";
import { Prisma, type Flag, type FlagChangeRequest, type FlagEnvironment } from "@prisma/client";
import type { CurrentUser } from "@/platform/authz";
import { ConflictError, NotFoundError } from "@/platform/authz";
import { mutate, scopedDb, type MutationContext } from "@/platform/data";
import { approvalsFor, decideApproval, requestApproval } from "@/platform/approvals";

export const ENVIRONMENTS = ["dev", "staging", "prod"] as const satisfies readonly FlagEnvironment[];
/** Environments where flags_admin may create/edit flags without approval. */
export const DIRECT_ENVIRONMENTS: readonly FlagEnvironment[] = ["dev", "staging"];
export const requiresApproval = (env: FlagEnvironment) => !DIRECT_ENVIRONMENTS.includes(env);

const CR_ENTITY = "FlagChangeRequest";
const CR_ACTION = "flag.prod_change";
const KEY_RE = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const EDITABLE = ["description", "enabled", "rolloutPercent"] as const;

/** Invalid input -> HTTP 400. */
export class FlagValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FlagValidationError";
  }
}

export type FlagValues = { description: string; enabled: boolean; rolloutPercent: number };
export type NewFlagInput = FlagValues & { key: string; environment: FlagEnvironment };
export type FlagDiff = Partial<Record<keyof FlagValues, { from: unknown; to: unknown }>>;

// ---------- input parsing (shared by server actions and route handlers) ----------

function parseEnvironment(v: unknown): FlagEnvironment {
  if (typeof v === "string" && (ENVIRONMENTS as readonly string[]).includes(v)) return v as FlagEnvironment;
  throw new FlagValidationError(`environment must be one of ${ENVIRONMENTS.join(", ")}`);
}

function parseRollout(v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) {
    throw new FlagValidationError("rolloutPercent must be an integer between 0 and 100");
  }
  return n;
}

function parseEnabled(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v === "on" || v === "true") return true;
  if (v === "false" || v === undefined || v === null || v === "") return false;
  throw new FlagValidationError("enabled must be a boolean");
}

function parseDescription(v: unknown): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > 500) {
    throw new FlagValidationError("description is required (max 500 characters)");
  }
  return v.trim();
}

export function parseNewFlag(raw: Record<string, unknown>): NewFlagInput {
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!KEY_RE.test(key)) throw new FlagValidationError("key must be 2-63 chars of a-z, 0-9, '.', '_' or '-'");
  return {
    key,
    environment: parseEnvironment(raw.environment),
    description: parseDescription(raw.description),
    enabled: parseEnabled(raw.enabled),
    rolloutPercent: parseRollout(raw.rolloutPercent),
  };
}

/** Partial update: only fields present in `raw` change. `key` and `environment` are immutable. */
export function parseFlagPatch(raw: Record<string, unknown>): Partial<FlagValues> {
  if ("key" in raw || "environment" in raw) throw new FlagValidationError("key and environment cannot be changed");
  const out: Partial<FlagValues> = {};
  if ("description" in raw) out.description = parseDescription(raw.description);
  if ("enabled" in raw) out.enabled = parseEnabled(raw.enabled);
  if ("rolloutPercent" in raw) out.rolloutPercent = parseRollout(raw.rolloutPercent);
  return out;
}

export function diffFlag(before: Partial<FlagValues> | null, after: FlagValues): FlagDiff {
  const out: FlagDiff = {};
  for (const f of EDITABLE) {
    const from = before ? before[f] : null;
    if (from !== after[f]) out[f] = { from: from ?? null, to: after[f] };
  }
  return out;
}

const valuesOf = (f: Pick<Flag, keyof FlagValues>): FlagValues => ({
  description: f.description,
  enabled: f.enabled,
  rolloutPercent: f.rolloutPercent,
});

// ---------- reads ----------

export async function listFlags(user: CurrentUser, environment?: FlagEnvironment) {
  return scopedDb(user).flag.findMany({
    where: environment ? { environment } : undefined,
    orderBy: [{ key: "asc" }, { environment: "asc" }],
  });
}

export async function listPendingChangeRequests(user: CurrentUser) {
  return scopedDb(user).flagChangeRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
}

/** 404 (NotFoundError) when the flag does not exist. */
export async function getFlag(user: CurrentUser, id: string) {
  const db = scopedDb(user);
  const flag = await db.flag.findUniqueOrThrow({ where: { id } });
  const changeRequests = await db.flagChangeRequest.findMany({ where: { flagId: id }, orderBy: { createdAt: "desc" } });
  return { flag, changeRequests, pending: changeRequests.find((c) => c.status === "PENDING") ?? null };
}

/** 404 (NotFoundError) when the change request does not exist. */
export async function getChangeRequest(user: CurrentUser, id: string) {
  const db = scopedDb(user);
  const changeRequest = await db.flagChangeRequest.findUniqueOrThrow({ where: { id } });
  const current = changeRequest.flagId ? await db.flag.findUnique({ where: { id: changeRequest.flagId } }) : null;
  const approvals = await approvalsFor(db, CR_ENTITY, id);
  const base = (changeRequest.baseSnapshot as FlagValues | null) ?? null;
  return { changeRequest, current, approvals, diff: diffFlag(base, valuesOf(changeRequest)) };
}

// ---------- writes ----------

export type WriteResult =
  | { status: "applied"; flag: Flag }
  | { status: "pending_approval"; changeRequest: FlagChangeRequest };

function conflictOnDuplicate(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new ConflictError("A flag with this key already exists in this environment");
  }
  throw e;
}

/** dev/staging: created immediately. prod: creates a change request that needs a second flags admin. */
export async function createFlag(user: CurrentUser, input: NewFlagInput, comment?: string): Promise<WriteResult> {
  return mutate(user, async (ctx) => {
    const { tx, audit } = ctx;
    const existing = await tx.flag.findFirst({ where: { key: input.key, environment: input.environment } });
    if (existing) throw new ConflictError("A flag with this key already exists in this environment");

    if (requiresApproval(input.environment)) {
      const changeRequest = await openChangeRequest(ctx, { kind: "CREATE", flag: null, ...input }, comment);
      return { status: "pending_approval", changeRequest };
    }

    const flag = await tx.flag
      .create({ data: { ...input, createdByOid: user.oid, updatedByOid: user.oid } })
      .catch(conflictOnDuplicate);
    await audit({ action: "flag.create", entityType: "Flag", entityId: flag.id, before: null, after: flag });
    return { status: "applied", flag };
  });
}

/** dev/staging: applied immediately. prod: creates a change request that needs a second flags admin. */
export async function updateFlag(user: CurrentUser, id: string, patch: Partial<FlagValues>, comment?: string): Promise<WriteResult> {
  return mutate(user, async (ctx) => {
    const { tx, audit } = ctx;
    const before = await tx.flag.findUniqueOrThrow({ where: { id } });
    const proposed = { ...valuesOf(before), ...patch };
    if (Object.keys(diffFlag(valuesOf(before), proposed)).length === 0) throw new FlagValidationError("No changes");

    if (requiresApproval(before.environment)) {
      const changeRequest = await openChangeRequest(
        ctx,
        { kind: "UPDATE", flag: before, key: before.key, environment: before.environment, ...proposed },
        comment,
      );
      return { status: "pending_approval", changeRequest };
    }

    const flag = await tx.flag.update({ where: { id }, data: { ...proposed, updatedByOid: user.oid } });
    await audit({ action: "flag.update", entityType: "Flag", entityId: id, before, after: flag });
    return { status: "applied", flag };
  });
}

async function openChangeRequest(
  ctx: MutationContext,
  input: NewFlagInput & { kind: "CREATE" | "UPDATE"; flag: Flag | null },
  comment?: string,
) {
  const { tx, audit, user } = ctx;
  const { kind, flag, ...values } = input;
  const pending = await tx.flagChangeRequest.findFirst({
    where: { key: values.key, environment: values.environment, status: "PENDING" },
  });
  if (pending) throw new ConflictError("A change to this prod flag is already pending approval");

  const created = await tx.flagChangeRequest.create({
    data: {
      kind,
      flagId: flag?.id ?? null,
      ...values,
      baseSnapshot: flag ? { ...valuesOf(flag), updatedAt: flag.updatedAt.toISOString() } : Prisma.JsonNull,
      requesterOid: user.oid,
      requestComment: comment || null,
    },
  });
  const approval = await requestApproval(ctx, { entityType: CR_ENTITY, entityId: created.id, action: CR_ACTION, comment });
  const changeRequest = await tx.flagChangeRequest.update({ where: { id: created.id }, data: { approvalId: approval.id } });
  await audit({ action: "flag_change_request.create", entityType: CR_ENTITY, entityId: created.id, before: flag, after: changeRequest });
  return changeRequest;
}

/** Checker approves or rejects a prod change. Never the requester (platform + DB CHECK enforce it). */
export async function decideChangeRequest(
  user: CurrentUser,
  changeRequestId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
) {
  return mutate(user, async (ctx) => {
    const { tx, audit } = ctx;
    const crBefore = await tx.flagChangeRequest.findUniqueOrThrow({ where: { id: changeRequestId } });
    if (!crBefore.approvalId) throw new NotFoundError();
    if (crBefore.status !== "PENDING") throw new ConflictError(`Change request already ${crBefore.status.toLowerCase()}`);
    await decideApproval(ctx, { approvalId: crBefore.approvalId, decision, comment, requiredPermission: "flags:approve" });

    let flagId = crBefore.flagId;
    if (decision === "APPROVED") {
      const values = valuesOf(crBefore);
      if (crBefore.kind === "CREATE") {
        const flag = await tx.flag
          .create({
            data: { key: crBefore.key, environment: crBefore.environment, ...values, createdByOid: crBefore.requesterOid, updatedByOid: user.oid },
          })
          .catch(conflictOnDuplicate);
        flagId = flag.id;
        await audit({ action: "flag.create", entityType: "Flag", entityId: flag.id, before: null, after: flag });
      } else {
        const before = await tx.flag.findUniqueOrThrow({ where: { id: crBefore.flagId! } });
        const base = crBefore.baseSnapshot as { updatedAt?: string } | null;
        if (base?.updatedAt && before.updatedAt.toISOString() !== base.updatedAt) {
          throw new ConflictError("The flag changed after this request was made; request the change again");
        }
        const after = await tx.flag.update({ where: { id: before.id }, data: { ...values, updatedByOid: user.oid } });
        await audit({ action: "flag.update", entityType: "Flag", entityId: before.id, before, after });
      }
    }

    const changeRequest = await tx.flagChangeRequest.update({
      where: { id: crBefore.id },
      data: { status: decision, decidedAt: new Date(), flagId },
    });
    await audit({
      action: `flag_change_request.${decision.toLowerCase()}`,
      entityType: CR_ENTITY,
      entityId: crBefore.id,
      before: crBefore,
      after: changeRequest,
    });
    return changeRequest;
  });
}
