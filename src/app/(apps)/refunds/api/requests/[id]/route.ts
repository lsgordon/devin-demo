import { withPermission } from "@/platform/authz";
import { getRefund } from "@/apps/refunds/service";

// GET /refunds/api/requests/:id -> 403 without refunds:read, 404 when out of scope, masked PII unless pii:read.
export const GET = withPermission(
  "refunds:read",
  async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return Response.json(await getRefund(user, id));
  },
);
