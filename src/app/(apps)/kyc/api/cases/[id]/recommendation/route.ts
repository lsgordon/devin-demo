import { withPermission } from "@/platform/authz";
import { jsonInput, parseRecommendation, respond } from "@/apps/kyc/input";
import { recommend } from "@/apps/kyc/service";

// POST /kyc/api/cases/:id/recommendation {recommendation: "APPROVE"|"REJECT", reason?} -> maker step
export const POST = withPermission("kyc:write", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return respond(async () => {
    const { recommendation, reason } = parseRecommendation(await jsonInput(req));
    return recommend(user, id, recommendation, reason);
  });
});
