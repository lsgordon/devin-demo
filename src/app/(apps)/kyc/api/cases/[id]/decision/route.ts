import { withPermission } from "@/platform/authz";
import { jsonInput, parseDecision, respond } from "@/apps/kyc/input";
import { decide } from "@/apps/kyc/service";

// POST /kyc/api/cases/:id/decision {decision: "APPROVE"|"REJECT", comment?} -> checker step
export const POST = withPermission("kyc:approve", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return respond(async () => {
    const { decision, comment } = parseDecision(await jsonInput(req));
    return decide(user, id, decision, comment);
  });
});
