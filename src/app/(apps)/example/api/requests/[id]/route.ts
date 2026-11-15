import { withPermission } from "@/platform/authz";
import { getRequest } from "@/apps/example/service";

// GET /example/api/requests/:id -> 403 without example:read, 404 when out of scope, masked PII unless pii:read.
export const GET = withPermission(
  "example:read",
  async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return Response.json(await getRequest(user, id));
  },
);
