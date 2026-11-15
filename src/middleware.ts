// Coarse gate: unauthenticated users are sent to /login (pages) or get 401 (APIs).
// This is NOT authorization. Every route, page and server action still calls withPermission/requirePermission.
export { auth as middleware } from "@/platform/auth/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
