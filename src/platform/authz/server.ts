import "server-only";
import { forbidden, notFound, unauthorized } from "next/navigation";
import { auth } from "@/platform/auth/auth";
import { assertPermission, buildUser, type CurrentUser } from "./core";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "./errors";
import type { Permission } from "./permissions";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const c = session?.claims;
  if (!c?.oid) return null;
  return buildUser({ oid: c.oid, tid: c.tid, username: c.preferred_username, name: c.name, roles: c.roles });
}

/** Translate platform errors into Next.js HTTP interrupts (401/403/404). Works in pages, route handlers and server actions. */
function interrupt(e: unknown): never {
  if (e instanceof UnauthenticatedError) unauthorized();
  if (e instanceof ForbiddenError) forbidden();
  if (e instanceof NotFoundError) notFound();
  throw e;
}

/** For pages / layouts: `const user = await requireUser();` */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  return user;
}

/** For pages / layouts: `const user = await requirePermission("audit:read");` -> 403 if missing. */
export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  try {
    assertPermission(user, perm);
  } catch (e) {
    interrupt(e);
  }
  return user;
}

/**
 * THE wrapper for route handlers and server actions. Checks the permission server-side, then calls
 * `handler(user, ...originalArgs)`. ForbiddenError -> 403, NotFoundError -> 404 (out-of-scope rows),
 * ConflictError -> 409 (route handlers) / rethrown (actions).
 *
 *   export const GET = withPermission("kyc:read", async (user, req: Request, ctx) => { ... });
 *   export const approve = withPermission("kyc:approve", async (user, formData: FormData) => { ... });
 */
export function withPermission<A extends unknown[], R>(
  perm: Permission,
  handler: (user: CurrentUser, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const wrapped = async (...args: A): Promise<R> => {
    const user = await getCurrentUser();
    try {
      if (!user) throw new UnauthenticatedError();
      assertPermission(user, perm);
      return await handler(user, ...args);
    } catch (e) {
      if (e instanceof ConflictError && args[0] instanceof Request) {
        return Response.json({ error: e.message }, { status: 409 }) as R;
      }
      interrupt(e);
    }
  };
  return wrapped;
}

/** Explicit opt-out for routes that must be public (e.g. the Auth.js callback). Platform-only. */
export function publicRoute<A extends unknown[], R>(handler: (...args: A) => Promise<R>) {
  return handler;
}
