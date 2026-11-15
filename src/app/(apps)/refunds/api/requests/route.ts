import { withPermission } from "@/platform/authz";
import { createRefund, listRefunds, ValidationError } from "@/apps/refunds/service";

// GET /refunds/api/requests?status=&reason=&q=&min=&max= -> scoped, masked list + totals.
export const GET = withPermission("refunds:read", async (user, req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return Response.json(await listRefunds(user, params));
});

// POST /refunds/api/requests {orderId, customerEmail, cardLast4, amount, reason, note?} -> 201, 400 on invalid input.
export const POST = withPermission("refunds:write", async (user, req: Request) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "JSON body required" }, { status: 400 });
  try {
    return Response.json(await createRefund(user, body as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
});
