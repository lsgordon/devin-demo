import "server-only";
import { ConflictError } from "@/platform/authz";
import { FlagValidationError } from "./service";

/** Parse a JSON object body; anything else -> 400. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FlagValidationError("Body must be a JSON object");
  return body as Record<string, unknown>;
}

/** Validation -> 400. Everything else (403/404/409 etc.) is rethrown for withPermission to map. */
export async function jsonOr400(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FlagValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

/** For server actions: business-rule errors become a user-facing message instead of an error page. */
export function userError(e: unknown): string | null {
  if (e instanceof FlagValidationError || e instanceof ConflictError) return e.message;
  return null;
}
