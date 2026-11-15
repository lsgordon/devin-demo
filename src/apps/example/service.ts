import "server-only";
import type { CurrentUser } from "@/platform/authz";
import { ConflictError } from "@/platform/authz";
import { mutate, scopedDb } from "@/platform/data";
import { approvalsFor, decideApproval, requestApproval } from "@/platform/approvals";

const ENTITY = "ExampleRequest";
const ACTION = "example.submit";

export async function listRequests(user: CurrentUser) {
  return scopedDb(user).exampleRequest.findMany({ orderBy: { id: "asc" } });
}

/** 404 (NotFoundError) when the row does not exist or is outside the user's scope. */
export async function getRequest(user: CurrentUser, id: string) {
  const db = scopedDb(user);
  const request = await db.exampleRequest.findUniqueOrThrow({ where: { id } });
  const approvals = await approvalsFor(db, ENTITY, id);
  return { request, approvals };
}

export async function submitForApproval(user: CurrentUser, id: string, comment?: string) {
  return mutate(user, async (ctx) => {
    const before = await ctx.tx.exampleRequest.findUniqueOrThrow({ where: { id } });
    if (before.status !== "DRAFT" && before.status !== "REJECTED") throw new ConflictError("Only draft or rejected requests can be submitted");
    await requestApproval(ctx, { entityType: ENTITY, entityId: id, action: ACTION, comment });
    const after = await ctx.tx.exampleRequest.update({ where: { id }, data: { status: "PENDING_APPROVAL" } });
    await ctx.audit({ action: "example_request.submit", entityType: ENTITY, entityId: id, before, after });
    return after;
  });
}

export async function decide(user: CurrentUser, approvalId: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  return mutate(user, async (ctx) => {
    const approval = await decideApproval(ctx, { approvalId, decision, comment, requiredPermission: "example:approve" });
    const before = await ctx.tx.exampleRequest.findUniqueOrThrow({ where: { id: approval.entityId } });
    const after = await ctx.tx.exampleRequest.update({ where: { id: approval.entityId }, data: { status: decision } });
    await ctx.audit({ action: `example_request.${decision.toLowerCase()}`, entityType: ENTITY, entityId: after.id, before, after });
    return after;
  });
}
