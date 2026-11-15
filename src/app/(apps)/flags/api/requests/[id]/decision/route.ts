import { withPermission } from "@/platform/authz";
import { decideChangeRequest, FlagValidationError } from "@/apps/flags/service";
import { jsonOr400, readJsonObject } from "@/apps/flags/http";

// POST /flags/api/requests/:id/decision {decision: "APPROVED"|"REJECTED", comment?}
// 403 without flags:approve or when deciding your own request; 409 if already decided.
export const POST = withPermission("flags:approve", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) =>
  jsonOr400(async () => {
    const { id } = await ctx.params;
    const body = await readJsonObject(req);
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") throw new FlagValidationError("decision must be APPROVED or REJECTED");
    const comment = typeof body.comment === "string" ? body.comment : undefined;
    return Response.json(await decideChangeRequest(user, id, body.decision, comment));
  }),
);
