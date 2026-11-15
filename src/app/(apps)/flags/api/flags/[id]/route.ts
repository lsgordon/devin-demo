import { withPermission } from "@/platform/authz";
import { getFlag, parseFlagPatch, updateFlag } from "@/apps/flags/service";
import { jsonOr400, readJsonObject } from "@/apps/flags/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /flags/api/flags/:id -> 403 without flags:read, 404 when missing.
export const GET = withPermission("flags:read", async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return Response.json(await getFlag(user, id));
});

// PATCH /flags/api/flags/:id -> 200 (dev/staging, applied) | 202 (prod, change request pending approval).
export const PATCH = withPermission("flags:write", async (user, req: Request, ctx: Ctx) =>
  jsonOr400(async () => {
    const { id } = await ctx.params;
    const { comment, ...rest } = await readJsonObject(req);
    const res = await updateFlag(user, id, parseFlagPatch(rest), typeof comment === "string" ? comment : undefined);
    return Response.json(res, { status: res.status === "applied" ? 200 : 202 });
  }),
);
