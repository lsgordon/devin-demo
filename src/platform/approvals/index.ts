import "server-only";
import type { Approval } from "@prisma/client";
import { assertPermission } from "@/platform/authz/core";
import { ConflictError, ForbiddenError, NotFoundError } from "@/platform/authz/errors";
import type { Permission } from "@/platform/authz/permissions";
import type { MutationContext, ScopedDb, ScopedTx } from "@/platform/data";

export type { Approval };

/**
 * Generic maker-checker. Attach to any entity by (entityType, entityId, action).
 * Call inside mutate() so the approval row, the audit entry and your entity change commit together.
 */
export async function requestApproval(
  { user, tx, audit }: MutationContext,
  input: { entityType: string; entityId: string; action: string; comment?: string },
): Promise<Approval> {
  const existing = await tx.approval.findFirst({
    where: { entityType: input.entityType, entityId: input.entityId, action: input.action, status: "PENDING" },
  });
  if (existing) throw new ConflictError("An approval is already pending for this item");
  const approval = await tx.approval.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      requesterOid: user.oid,
      requesterUsername: user.username,
      requestComment: input.comment || null,
    },
  });
  await audit({ action: "approval.requested", entityType: "Approval", entityId: approval.id, after: approval });
  return approval;
}

/**
 * Approve or reject. Enforces: caller has `requiredPermission`; caller is NOT the requester
 * (also enforced by a DB CHECK constraint); approval is still PENDING.
 * Returns the decided approval; apply the entity's state change in the same mutate() callback.
 */
export async function decideApproval(
  { user, tx, audit }: MutationContext,
  input: { approvalId: string; decision: "APPROVED" | "REJECTED"; comment?: string; requiredPermission: Permission },
): Promise<Approval> {
  assertPermission(user, input.requiredPermission);
  const before = await tx.approval.findUnique({ where: { id: input.approvalId } });
  if (!before) throw new NotFoundError();
  if (before.requesterOid === user.oid) throw new ForbiddenError("You cannot approve or reject your own request");
  if (before.status !== "PENDING") throw new ConflictError(`Approval already ${before.status.toLowerCase()}`);
  const after = await tx.approval.update({
    where: { id: before.id, status: "PENDING" },
    data: {
      status: input.decision,
      deciderOid: user.oid,
      deciderUsername: user.username,
      decisionComment: input.comment || null,
      decidedAt: new Date(),
    },
  });
  await audit({
    action: input.decision === "APPROVED" ? "approval.approved" : "approval.rejected",
    entityType: "Approval",
    entityId: after.id,
    before,
    after,
  });
  return after;
}

export async function approvalsFor(client: ScopedDb | ScopedTx, entityType: string, entityId: string) {
  return client.approval.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" } });
}
