/**
 * Switching from the mock IdP to real Entra ID must be env-vars only.
 * Fails if any vendor-specific auth code path creeps into the codebase.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { oidcConfigFromEnv, REQUIRED_AUTH_ENV } from "@/platform/auth/env";

const ROOT = path.resolve(__dirname, "../..");
const SCAN = ["src", "prisma", "scripts", "next.config.ts", "package.json"];
const FORBIDDEN = [
  /microsoft-entra-id/i,
  /azure-ad/i,
  /next-auth\/providers\/(?!credentials)/,
  /@auth\/core\/providers\/(?!credentials)/,
  /login\.microsoftonline\.com/i,
  /@azure\/msal/i,
  /graph\.microsoft\.com/i,
];

function walk(p: string): string[] {
  const full = path.join(ROOT, p);
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((n) => walk(path.join(p, n)));
}

describe("no Entra/vendor-specific auth code", () => {
  const files = SCAN.flatMap(walk).filter((f) => /\.(ts|tsx|js|mjs|json|prisma)$/.test(f) && !f.endsWith(".generated.ts"));

  it.each(FORBIDDEN.map((r) => r.source))("no match for /%s/", (src) => {
    const re = new RegExp(src, "i");
    const hits = files.filter((f) => re.test(readFileSync(path.join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });

  it("the IdP is configured from env vars only", () => {
    expect(REQUIRED_AUTH_ENV).toEqual(["AUTH_SECRET", "AUTH_OIDC_ISSUER", "AUTH_OIDC_CLIENT_ID", "AUTH_OIDC_CLIENT_SECRET"]);
    const entra = oidcConfigFromEnv({
      AUTH_SECRET: "x",
      AUTH_OIDC_ISSUER: "https://idp.example.com/tenant/v2.0",
      AUTH_OIDC_CLIENT_ID: "id",
      AUTH_OIDC_CLIENT_SECRET: "secret",
    });
    expect(entra).toEqual({ issuer: "https://idp.example.com/tenant/v2.0", clientId: "id", clientSecret: "secret" });
  });

  it("startup check fails fast when auth env is missing", () => {
    expect(() => oidcConfigFromEnv({ AUTH_SECRET: "x" })).toThrow(/AUTH_OIDC_ISSUER/);
    expect(() =>
      oidcConfigFromEnv({ AUTH_SECRET: "x", AUTH_OIDC_ISSUER: "not a url", AUTH_OIDC_CLIENT_ID: "a", AUTH_OIDC_CLIENT_SECRET: "b" }),
    ).toThrow(/valid URL/);
  });
});
