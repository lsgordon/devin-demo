/**
 * Startup check: the IdP is configured with env vars only. Switching from the mock to real
 * Entra ID is a matter of changing these three values (see README "Entra setup").
 */
export const REQUIRED_AUTH_ENV = ["AUTH_SECRET", "AUTH_OIDC_ISSUER", "AUTH_OIDC_CLIENT_ID", "AUTH_OIDC_CLIENT_SECRET"] as const;

export function oidcConfigFromEnv(env: Record<string, string | undefined> = process.env) {
  const missing = REQUIRED_AUTH_ENV.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required auth env vars: ${missing.join(", ")}`);
  const issuer = env.AUTH_OIDC_ISSUER!;
  try {
    new URL(issuer);
  } catch {
    throw new Error(`AUTH_OIDC_ISSUER is not a valid URL: ${issuer}`);
  }
  return { issuer, clientId: env.AUTH_OIDC_CLIENT_ID!, clientSecret: env.AUTH_OIDC_CLIENT_SECRET! };
}
