import { expect, test } from "@playwright/test";
import { PERSONAS } from "../src/platform/auth/personas";
import { permissionsForRoles } from "../src/platform/authz/core";
import { APPS } from "../src/platform/apps/registry";
import { db, login } from "./helpers";

test.afterAll(async () => db.$disconnect());

test.describe("login via mock OIDC", () => {
  for (const p of PERSONAS) {
    test(`${p.key} can log in and sees their roles claim`, async ({ page }) => {
      await login(page, p.key);
      await page.goto("/whoami");
      const claims = JSON.parse((await page.getByTestId("whoami-claims").textContent()) ?? "{}");
      expect(claims.oid).toBe(p.oid);
      expect(claims.preferred_username).toBe(p.preferred_username);
      expect(claims.tid).toMatch(/^[0-9a-f-]{36}$/);
      expect([...claims.roles].sort()).toEqual([...p.roles].sort());
    });
  }
});

test.describe("nav shows only permitted apps", () => {
  for (const p of PERSONAS) {
    test(`${p.key}`, async ({ page }) => {
      const perms = permissionsForRoles(p.roles);
      await login(page, p.key);
      for (const app of APPS) {
        const link = page.getByTestId(`nav-${app.id}`);
        if (perms.has(app.requiredPermission)) await expect(link).toBeVisible();
        else await expect(link).toHaveCount(0);
      }
      await expect(page.getByTestId("nav-audit")).toHaveCount(perms.has("audit:read") ? 1 : 0);
    });
  }

  test("hidden app is also blocked server-side (403), not just hidden", async ({ page }) => {
    await login(page, "flags.admin1");
    const res = await page.goto("/example");
    expect(res?.status()).toBe(403);
  });
});

test.describe("audit viewer", () => {
  for (const p of PERSONAS.filter((x) => !x.roles.includes("auditor"))) {
    test(`is 403 for ${p.key}`, async ({ page }) => {
      await login(page, p.key);
      const res = await page.goto("/audit");
      expect(res?.status()).toBe(403);
      await expect(page.getByTestId("audit-table")).toHaveCount(0);
    });
  }

  test("is 200 for auditor and filterable", async ({ page }) => {
    await login(page, "auditor1");
    const res = await page.goto("/audit?actor=nobody-matches-this");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("audit-table")).toContainText("No entries.");
  });
});

test.describe("unauthenticated", () => {
  test("pages redirect to /login", async ({ page }) => {
    await page.goto("/audit");
    await expect(page).toHaveURL(/\/login/);
  });

  test("APIs return 401", async ({ request }) => {
    const res = await request.get("/example/api/requests/example-0001", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });
});

test.describe("audit table is append-only in the database", () => {
  test("UPDATE, DELETE and TRUNCATE are rejected", async () => {
    const row = await db.auditLog.create({
      data: { actorOid: "e2e", actorUsername: "e2e@example.com", action: "e2e.probe", entityType: "E2E", entityId: "1" },
    });
    await expect(db.$executeRaw`UPDATE audit_log SET action = 'tampered' WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM audit_log WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`TRUNCATE audit_log`)).rejects.toThrow(/append-only/);
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: row.id } })).action).toBe("e2e.probe");
  });
});
