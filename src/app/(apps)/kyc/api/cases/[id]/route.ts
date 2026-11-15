import { withPermission } from "@/platform/authz";
import { getCase } from "@/apps/kyc/service";

// GET /kyc/api/cases/:id -> 403 without kyc:read, 404 when out of scope, PII masked unless pii:read.
export const GET = withPermission("kyc:read", async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return Response.json(await getCase(user, id));
});
