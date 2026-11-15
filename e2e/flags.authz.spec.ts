import { expect, test, type Page } from "@playwright/test";
import { persona } from "../src/platform/auth/personas";
import seedFlags from "../src/apps/flags/seed";
import { db, login } from "./helpers";

// Rules (spec):
//  1. flags_admin can create and edit flags in dev/staging directly.
//  2. Any change to a prod flag requires maker-checker approval by a different flags_admin.
//  3. auditor has read-only access.
//  4. Every change is audited with a before/after diff.
//  (+ only flags:read roles can open the app; unknown ids are 404.)

const PROD = "flag-prod-new-checkout";
const STAGING = "flag-staging-new-checkout";
const DEV = "flag-dev-dark-mode";
const uniq = () => `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

async function auditActions(entityIds: string[], since: Date) {
  const rows = await db.auditLog.findMany({ where: { entityId: { in: entityIds }, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
  return rows;
}

async function resetFlags() {
  await db.approval.deleteMany({ where: { entityType: "FlagChangeRequest" } });
  await db.flagChangeRequest.deleteMany({});
  await db.flag.deleteMany({});
  await seedFlags(db);
}

const patch = (page: Page, id: string, data: Record<string, unknown>) => page.request.patch(`/flags/api/flags/${id}`, { data });
const decide = (page: Page, crId: string, decision: "APPROVED" | "REJECTED") =>
  page.request.post(`/flags/api/requests/${crId}/decision`, { data: { decision } });

test.beforeAll(resetFlags);
test.afterAll(async () => db.$disconnect());

test.describe("access", () => {
  for (const key of ["flags.admin1", "auditor1"] as const) {
    test(`${key} can open the app (page and API)`, async ({ page }) => {
      await login(page, key);
      expect((await page.goto("/flags"))?.status()).toBe(200);
      await expect(page.getByTestId("flag-new-checkout-prod")).toBeVisible();
      expect((await page.goto(`/flags/${PROD}`))?.status()).toBe(200);
      expect((await page.request.get("/flags/api/flags")).status()).toBe(200);
      expect((await page.request.get(`/flags/api/flags/${PROD}`)).status()).toBe(200);
    });
  }

  for (const key of ["noroles", "kyc.analyst1", "refunds.approver1"] as const) {
    test(`${key} gets 403 (page and API, read and write)`, async ({ page }) => {
      await login(page, key);
      expect((await page.goto("/flags"))?.status()).toBe(403);
      expect((await page.goto(`/flags/${PROD}`))?.status()).toBe(403);
      expect((await page.request.get("/flags/api/flags")).status()).toBe(403);
      expect((await page.request.get(`/flags/api/flags/${PROD}`)).status()).toBe(403);
      expect((await patch(page, DEV, { enabled: false })).status()).toBe(403);
    });
  }

  test("unknown flag / change request is 404 (page and API)", async ({ page }) => {
    await login(page, "flags.admin1");
    expect((await page.goto("/flags/does-not-exist"))?.status()).toBe(404);
    expect((await page.goto("/flags/requests/does-not-exist"))?.status()).toBe(404);
    expect((await page.request.get("/flags/api/flags/does-not-exist")).status()).toBe(404);
    expect((await patch(page, "does-not-exist", { enabled: true })).status()).toBe(404);
    expect((await decide(page, "does-not-exist", "APPROVED")).status()).toBe(404);
  });
});

test.describe("dev/staging: flags_admin edits directly", () => {
  test("create a dev flag via the UI: applied immediately, audited with before=null", async ({ page }) => {
    const since = new Date();
    const key = uniq();
    await login(page, "flags.admin1");
    await page.goto("/flags");
    const form = page.getByTestId("create-flag");
    await form.getByLabel("Key").fill(key);
    await form.getByLabel("Description").fill("E2E dev flag");
    await form.getByLabel("Environment").selectOption("dev");
    await form.getByLabel("Enabled").check();
    await form.getByLabel("Rollout percent").fill("25");
    await page.getByTestId("create-flag-submit").click();
    await expect(page.getByTestId("rollout")).toHaveText("25%");
    await expect(page.getByTestId("enabled")).toHaveText("on");

    const flag = await db.flag.findUniqueOrThrow({ where: { key_environment: { key, environment: "dev" } } });
    expect(flag.createdByOid).toBe(persona("flags.admin1").oid);
    const audits = await auditActions([flag.id], since);
    expect(audits.map((a) => a.action)).toEqual(["flag.create"]);
    expect(audits[0].before).toBeNull();
    expect(audits[0].after).toMatchObject({ key, environment: "dev", enabled: true, rolloutPercent: 25 });
    expect(audits[0].actorOid).toBe(persona("flags.admin1").oid);
  });

  test("edit a staging flag via the UI and API: applied immediately, audited with before/after", async ({ page }) => {
    const since = new Date();
    await login(page, "flags.admin2");
    await page.goto(`/flags/${STAGING}`);
    await page.getByTestId("edit-rollout").fill("75");
    await page.getByTestId("edit-submit").click();
    await expect(page.getByTestId("rollout")).toHaveText("75%");

    const res = await patch(page, STAGING, { enabled: false });
    expect(res.status()).toBe(200);
    expect((await res.json()).flag).toMatchObject({ enabled: false, rolloutPercent: 75 });

    const audits = await auditActions([STAGING], since);
    expect(audits.map((a) => a.action)).toEqual(["flag.update", "flag.update"]);
    expect(audits[0].before).toMatchObject({ rolloutPercent: 50, enabled: true });
    expect(audits[0].after).toMatchObject({ rolloutPercent: 75, enabled: true });
    expect(audits[1].before).toMatchObject({ enabled: true });
    expect(audits[1].after).toMatchObject({ enabled: false });
    expect(await db.flagChangeRequest.count({ where: { flagId: STAGING } })).toBe(0);
  });

  test("create via API in staging returns 201; invalid input 400; duplicate key 409; key/env immutable", async ({ page }) => {
    await login(page, "flags.admin1");
    const key = uniq();
    const ok = await page.request.post("/flags/api/flags", { data: { key, environment: "staging", description: "x", enabled: true, rolloutPercent: 10 } });
    expect(ok.status()).toBe(201);
    const dup = await page.request.post("/flags/api/flags", { data: { key, environment: "staging", description: "x", enabled: true, rolloutPercent: 10 } });
    expect(dup.status()).toBe(409);
    expect((await page.request.post("/flags/api/flags", { data: { key: uniq(), environment: "qa", description: "x", rolloutPercent: 1 } })).status()).toBe(400);
    expect((await page.request.post("/flags/api/flags", { data: { key: uniq(), environment: "dev", description: "x", rolloutPercent: 101 } })).status()).toBe(400);
    expect((await patch(page, DEV, { rolloutPercent: -1 })).status()).toBe(400);
    expect((await patch(page, DEV, { environment: "prod" })).status()).toBe(400);
    expect((await patch(page, DEV, { key: "renamed" })).status()).toBe(400);
  });
});

test.describe("prod: maker-checker by a different flags_admin", () => {
  test("edit request: flag unchanged until a different admin approves; maker cannot approve own; fully audited", async ({ page }) => {
    const since = new Date();
    const prodBefore = await db.flag.findUniqueOrThrow({ where: { id: PROD } });

    // Maker (UI): request enabling the prod flag at 20%.
    await login(page, "flags.admin1");
    await page.goto(`/flags/${PROD}`);
    await page.getByTestId("edit-enabled").check();
    await page.getByTestId("edit-rollout").fill("20");
    await page.getByLabel("Comment").fill("Start prod rollout");
    await page.getByTestId("edit-submit").click();
    await expect(page.getByTestId("cr-status")).toHaveText("PENDING");
    await expect(page.getByTestId("diff-enabled")).toContainText("off");
    await expect(page.getByTestId("diff-rolloutPercent")).toContainText("20");
    // Maker sees no approve control...
    await expect(page.getByTestId("approve")).toHaveCount(0);
    await expect(page.getByTestId("own-request")).toBeVisible();
    const cr = await db.flagChangeRequest.findFirstOrThrow({ where: { flagId: PROD, status: "PENDING" } });

    // ...and the server refuses it (403), flag unchanged.
    expect((await decide(page, cr.id, "APPROVED")).status()).toBe(403);
    const still = await db.flag.findUniqueOrThrow({ where: { id: PROD } });
    expect({ enabled: still.enabled, rolloutPercent: still.rolloutPercent }).toEqual({ enabled: prodBefore.enabled, rolloutPercent: prodBefore.rolloutPercent });

    // Second request for the same prod flag while one is pending -> 409.
    expect((await patch(page, PROD, { rolloutPercent: 30 })).status()).toBe(409);

    // Checker (different admin, UI) approves -> change applied.
    await login(page, "flags.admin2");
    await page.goto(`/flags/requests/${cr.id}`);
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("cr-status")).toHaveText("APPROVED");
    await page.goto(`/flags/${PROD}`);
    await expect(page.getByTestId("enabled")).toHaveText("on");
    await expect(page.getByTestId("rollout")).toHaveText("20%");

    // Already decided -> 409.
    expect((await decide(page, cr.id, "REJECTED")).status()).toBe(409);

    const approval = await db.approval.findUniqueOrThrow({ where: { id: cr.approvalId! } });
    expect(approval.requesterOid).toBe(persona("flags.admin1").oid);
    expect(approval.deciderOid).toBe(persona("flags.admin2").oid);
    expect(approval.status).toBe("APPROVED");

    const audits = await auditActions([PROD, cr.id, approval.id], since);
    // Rows written in one transaction share created_at (transaction start), so compare as sets.
    expect(audits.map((a) => a.action).sort()).toEqual(
      ["approval.requested", "flag_change_request.create", "approval.approved", "flag.update", "flag_change_request.approved"].sort(),
    );
    const flagUpdate = audits.find((a) => a.action === "flag.update")!;
    expect(flagUpdate.actorOid).toBe(persona("flags.admin2").oid);
    expect(flagUpdate.before).toMatchObject({ enabled: false, rolloutPercent: 0 });
    expect(flagUpdate.after).toMatchObject({ enabled: true, rolloutPercent: 20 });
    const requested = audits.find((a) => a.action === "flag_change_request.create")!;
    expect(requested.before).toMatchObject({ enabled: false, rolloutPercent: 0 });
    expect(requested.after).toMatchObject({ enabled: true, rolloutPercent: 20, status: "PENDING" });
  });

  test("rejected request leaves the prod flag unchanged and is audited", async ({ page }) => {
    const since = new Date();
    const id = "flag-prod-dark-mode";
    await login(page, "flags.admin2");
    const res = await patch(page, id, { rolloutPercent: 90 });
    expect(res.status()).toBe(202);
    const { changeRequest } = await res.json();
    expect((await db.flag.findUniqueOrThrow({ where: { id } })).rolloutPercent).toBe(10);

    await login(page, "flags.admin1");
    expect((await decide(page, changeRequest.id, "REJECTED")).status()).toBe(200);
    expect((await db.flag.findUniqueOrThrow({ where: { id } })).rolloutPercent).toBe(10);
    const actions = (await auditActions([id, changeRequest.id, changeRequest.approvalId], since)).map((a) => a.action);
    expect(actions.sort()).toEqual(["approval.requested", "flag_change_request.create", "approval.rejected", "flag_change_request.rejected"].sort());
  });

  test("creating a prod flag also needs approval; it only exists after a different admin approves", async ({ page }) => {
    const key = uniq();
    await login(page, "flags.admin1");
    await page.goto("/flags");
    const form = page.getByTestId("create-flag");
    await form.getByLabel("Key").fill(key);
    await form.getByLabel("Description").fill("E2E prod flag");
    await form.getByLabel("Environment").selectOption("prod");
    await form.getByLabel("Rollout percent").fill("5");
    await page.getByTestId("create-flag-submit").click();
    await expect(page.getByTestId("cr-status")).toHaveText("PENDING");
    expect(await db.flag.count({ where: { key } })).toBe(0);
    const cr = await db.flagChangeRequest.findFirstOrThrow({ where: { key, status: "PENDING" } });
    expect((await decide(page, cr.id, "APPROVED")).status()).toBe(403);
    // Duplicate pending create for the same key -> 409.
    expect((await page.request.post("/flags/api/flags", { data: { key, environment: "prod", description: "dup", rolloutPercent: 1 } })).status()).toBe(409);

    await login(page, "flags.admin2");
    expect((await decide(page, cr.id, "APPROVED")).status()).toBe(200);
    const flag = await db.flag.findUniqueOrThrow({ where: { key_environment: { key, environment: "prod" } } });
    expect(flag).toMatchObject({ enabled: false, rolloutPercent: 5, createdByOid: persona("flags.admin1").oid });
    const create = await db.auditLog.findFirstOrThrow({ where: { entityId: flag.id, action: "flag.create" } });
    expect(create.before).toBeNull();
    expect(create.actorOid).toBe(persona("flags.admin2").oid);
  });

  test("DB CHECK rejects requester deciding their own flag approval", async () => {
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "FlagChangeRequest" } });
    await expect(db.approval.update({ where: { id: a.id }, data: { deciderOid: a.requesterOid } })).rejects.toThrow(/approval_decider_not_requester/);
  });
});

test.describe("auditor is read-only", () => {
  test("sees flags and requests but no write/approve controls", async ({ page }) => {
    await login(page, "auditor1");
    await page.goto("/flags");
    await expect(page.getByTestId("flags-list")).toBeVisible();
    await expect(page.getByTestId("create-flag")).toHaveCount(0);
    await page.goto(`/flags/${DEV}`);
    await expect(page.getByTestId("edit-flag")).toHaveCount(0);
  });

  test("every write and decision is 403 server-side; nothing changes", async ({ page }) => {
    const since = new Date();
    await login(page, "flags.admin1");
    const res = await patch(page, "flag-prod-dark-mode", { enabled: false });
    expect(res.status()).toBe(202);
    const { changeRequest } = await res.json();

    await login(page, "auditor1");
    const before = await db.flag.findMany({ orderBy: { id: "asc" } });
    expect((await page.request.post("/flags/api/flags", { data: { key: uniq(), environment: "dev", description: "x", rolloutPercent: 0 } })).status()).toBe(403);
    expect((await patch(page, DEV, { enabled: false })).status()).toBe(403);
    expect((await patch(page, PROD, { enabled: false })).status()).toBe(403);
    expect((await decide(page, changeRequest.id, "APPROVED")).status()).toBe(403);
    expect((await decide(page, changeRequest.id, "REJECTED")).status()).toBe(403);
    await page.goto(`/flags/requests/${changeRequest.id}`);
    await expect(page.getByTestId("cr-status")).toHaveText("PENDING");
    await expect(page.getByTestId("approve")).toHaveCount(0);

    expect(await db.flag.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect((await db.flagChangeRequest.findUniqueOrThrow({ where: { id: changeRequest.id } })).status).toBe("PENDING");
    const auditorRows = await db.auditLog.count({ where: { actorOid: persona("auditor1").oid, createdAt: { gte: since } } });
    expect(auditorRows).toBe(0);
  });

  test("auditor sees flag changes with before/after in the audit viewer", async ({ page }) => {
    await login(page, "auditor1");
    await page.goto(`/audit?entityType=Flag&entityId=${PROD}`);
    const row = page.getByTestId("audit-table").locator("tr", { hasText: "flag.update" }).first();
    await expect(row).toContainText('"rolloutPercent": 0');
    await expect(row).toContainText('"rolloutPercent": 20');
  });
});
