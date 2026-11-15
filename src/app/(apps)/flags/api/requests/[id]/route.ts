import { withPermission } from "@/platform/authz";
import { getChangeRequest } from "@/apps/flags/service";

// GET /flags/api/requests/:id -> change request with proposed diff and approval history.
export const GET = withPermission("flags:read", async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return Response.json(await getChangeRequest(user, id));
});
