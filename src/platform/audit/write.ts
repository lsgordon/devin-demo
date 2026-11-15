import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/platform/authz/core";

export type AuditEntryInput = {
  /** Dotted verb, e.g. "kyc_case.update", "approval.approved". */
  action: string;
  /** Prisma model name of the entity, e.g. "KycCase". Used for PII masking in the viewer. */
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
};

type AuditCapableTx = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** Append one audit row using the caller's transaction client. Prefer mutate() in app code. */
export async function writeAudit(tx: AuditCapableTx, user: Pick<CurrentUser, "oid" | "username">, e: AuditEntryInput) {
  await tx.auditLog.create({
    data: {
      actorOid: user.oid,
      actorUsername: user.username,
      action: e.action,
      entityType: e.entityType,
      entityId: String(e.entityId),
      before: toJson(e.before),
      after: toJson(e.after),
    },
  });
}
