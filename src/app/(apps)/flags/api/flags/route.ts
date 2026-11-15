import { withPermission } from "@/platform/authz";
import { createFlag, ENVIRONMENTS, listFlags, parseNewFlag } from "@/apps/flags/service";
import { jsonOr400, readJsonObject } from "@/apps/flags/http";
import type { FlagEnvironment } from "@prisma/client";

// GET /flags/api/flags?environment=prod -> 403 without flags:read.
export const GET = withPermission("flags:read", async (user, req: Request) => {
  const env = new URL(req.url).searchParams.get("environment");
  const environment = (ENVIRONMENTS as readonly string[]).includes(env ?? "") ? (env as FlagEnvironment) : undefined;
  return Response.json(await listFlags(user, environment));
});

// POST /flags/api/flags -> 201 (dev/staging, applied) | 202 (prod, change request pending approval).
export const POST = withPermission("flags:write", async (user, req: Request) =>
  jsonOr400(async () => {
    const body = await readJsonObject(req);
    const res = await createFlag(user, parseNewFlag(body), typeof body.comment === "string" ? body.comment : undefined);
    return Response.json(res, { status: res.status === "applied" ? 201 : 202 });
  }),
);
