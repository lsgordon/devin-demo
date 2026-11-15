import NextAuth from "next-auth";
import { oidcConfigFromEnv } from "./env";

/**
 * Auth.js v5 with a GENERIC OIDC provider. Works with the local mock IdP and with Entra ID
 * by changing env vars only. Do not add vendor-specific providers (enforced by tests).
 */
const oidc = (() => {
  try {
    return oidcConfigFromEnv();
  } catch (e) {
    // `next build` may run without auth env; instrumentation.ts fails fast at runtime instead.
    if (process.env.NEXT_PHASE === "phase-production-build") return { issuer: "http://localhost/unset", clientId: "unset", clientSecret: "unset" };
    throw e;
  }
})();

type Claims = { oid?: string; sub?: string; tid?: string; preferred_username?: string; name?: string; roles?: unknown };

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "oidc",
      name: "Company SSO",
      type: "oidc",
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      clientSecret: oidc.clientSecret,
      authorization: { params: { scope: "openid profile email" } },
      checks: ["pkce", "state", "nonce"],
      profile(profile: Claims) {
        return { id: profile.oid ?? profile.sub, name: profile.name, email: profile.preferred_username };
      },
    },
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        const c = profile as Claims;
        token.oid = c.oid ?? c.sub;
        token.tid = c.tid;
        token.preferred_username = c.preferred_username;
        token.name = c.name;
        token.roles = Array.isArray(c.roles) ? c.roles.filter((r): r is string => typeof r === "string") : [];
      }
      return token;
    },
    session({ session, token }) {
      session.claims = {
        oid: String(token.oid ?? ""),
        tid: String(token.tid ?? ""),
        preferred_username: String(token.preferred_username ?? ""),
        name: String(token.name ?? ""),
        roles: Array.isArray(token.roles) ? (token.roles as string[]) : [],
      };
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname.startsWith("/api/auth")) return true;
      if (session?.claims?.oid) return true;
      if (pathname.startsWith("/api/") || pathname.includes("/api/")) {
        return Response.json({ error: "Unauthenticated" }, { status: 401 });
      }
      return false; // redirect to /login
    },
  },
});

declare module "next-auth" {
  interface Session {
    claims: { oid: string; tid: string; preferred_username: string; name: string; roles: string[] };
  }
}
