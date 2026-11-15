import { withPermission } from "@/platform/authz";
import { decideRefund, parseDecision, ValidationError } from "@/apps/refunds/service";

// POST /refunds/api/requests/:id/decision {decision: "APPROVED"|"REJECTED", comment?}
// 403 without refunds:approve or on your own request, 404 out of scope, 409 when not pending.
export const POST = withPermission(
  "refunds:approve",
  async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    try {
      const decision = parseDecision(body.decision);
      return Response.json(await decideRefund(user, id, decision, typeof body.comment === "string" ? body.comment : undefined));
    } catch (e) {
      if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }
  },
);
