import { withPermission } from "@/platform/authz";
import { jsonInput, parseAssignment, respond } from "@/apps/kyc/input";
import { reassign } from "@/apps/kyc/service";

// POST /kyc/api/cases/:id/assignment {assigneeOid}
export const POST = withPermission("kyc:approve", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return respond(async () => reassign(user, id, parseAssignment(await jsonInput(req)).assigneeOid));
});
