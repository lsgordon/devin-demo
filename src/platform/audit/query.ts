import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/platform/db/client";
import type { CurrentUser } from "@/platform/authz/core";
import { assertPermission } from "@/platform/authz/core";
import { toClient } from "@/platform/pii";

export type AuditFilters = { entityType?: string; entityId?: string; actor?: string; action?: string };

/** Audit viewer query. Requires audit:read. PII inside before/after is masked per the entity's manifest. */
export async function queryAudit(user: CurrentUser, f: AuditFilters, take = 200) {
  assertPermission(user, "audit:read");
  const where: Prisma.AuditLogWhereInput = {
    ...(f.entityType && { entityType: f.entityType }),
    ...(f.entityId && { entityId: f.entityId }),
    ...(f.action && { action: { contains: f.action } }),
    ...(f.actor && { OR: [{ actorOid: f.actor }, { actorUsername: { contains: f.actor, mode: "insensitive" } }] }),
  };
  const rows = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({
    ...r,
    before: toClient(user, r.entityType, r.before),
    after: toClient(user, r.entityType, r.after),
  }));
}

export async function auditEntityTypes(): Promise<string[]> {
  const rows = await db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } });
  return rows.map((r) => r.entityType);
}
