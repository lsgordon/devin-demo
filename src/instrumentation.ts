export async function register() {
  const { oidcConfigFromEnv } = await import("@/platform/auth/env");
  oidcConfigFromEnv(); // fail fast at server start if the IdP is not configured
}
