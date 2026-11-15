import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { persona, type PersonaKey } from "../src/platform/auth/personas";

export const db = new PrismaClient();

/** Log in through the mock OIDC server's persona page (real OIDC code flow, no shortcuts). */
export async function login(page: Page, key: PersonaKey) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("sign-in").click();
  await page.locator(`button[data-persona="${key}"]`).click();
  await expect(page.getByTestId("current-user")).toHaveText(persona(key).preferred_username);
}

/** Fetch a page's RSC (flight) payload with the logged-in session. */
export async function rscPayload(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path, { headers: { RSC: "1" } });
  return res.text();
}

/** Asserts none of the raw values appear in the page HTML, its RSC payload, or the given API responses. */
export async function expectNoRawPii(page: Page, opts: { pagePath: string; apiPaths?: string[]; raw: string[] }) {
  const html = await (await page.request.get(opts.pagePath)).text();
  const rsc = await rscPayload(page, opts.pagePath);
  const apis = await Promise.all((opts.apiPaths ?? []).map(async (p) => (await page.request.get(p)).text()));
  for (const value of opts.raw) {
    expect(html, `raw PII ${value} in HTML of ${opts.pagePath}`).not.toContain(value);
    expect(rsc, `raw PII ${value} in RSC payload of ${opts.pagePath}`).not.toContain(value);
    for (const body of apis) expect(body, `raw PII ${value} in API response`).not.toContain(value);
  }
}
