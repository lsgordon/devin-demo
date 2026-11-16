import { expect, test, type Page } from "@playwright/test";
import { persona, type PersonaKey } from "../src/platform/auth/personas";
import seedKyc from "../src/apps/kyc/seed";
import { db, expectNoRawPii, login } from "./helpers";

// One test (or group) per rule in the kyc spec. Cases come from src/apps/kyc/seed.ts:
// kyc-0001, kyc-0002 -> kyc.analyst1; kyc-0003 -> kyc.analyst2; kyc-0004 -> unassigned.

const RAW = {
  "kyc-0001": ["TEST-0000-1111", "1991-03-14"],
  "kyc-0002": ["TEST-0000-2222", "1984-07-22"],
  "kyc-0003": ["TEST-0000-3333", "1975-11-02"],
};
const ALL_RAW = Object.values(RAW).flat();
const api = (id: string, sub = "") => `/kyc/api/cases/${id}${sub}`;
/** Navigate and wait for hydration, so form controls are not reset by React after we fill them. */
const open = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};
/**
 * Leave the current page first: in-flight requests (e.g. link prefetches) from the previous user's page can
 * otherwise land after login() clears cookies and refresh the old session cookie.
 */
const loginAs = async (page: Page, key: PersonaKey) => {
  await page.goto("about:blank");
  await login(page, key);
};
const post = (page: Page, path: string, data: Record<string, unknown>) => page.request.post(path, { data });
const caseActions = async (id: string, since: Date) =>
  (await db.auditLog.findMany({ where: { entityType: "KycCase", entityId: id, createdAt: { gte: since } } })).map((a) => a.action);

test.beforeAll(async () => {
  await db.approval.deleteMany({ where: { entityType: "KycCase" } });
  await db.kycNote.deleteMany({});
  await seedKyc(db);
});
test.afterAll(async () => db.$disconnect());

test.describe("access to the app", () => {
  for (const key of ["noroles", "refunds.agent1", "flags.admin1"] as const) {
    test(`${key} (no kyc:read) gets 403 on pages and APIs`, async ({ page }) => {
      await loginAs(page, key);
      expect((await page.goto("/kyc"))?.status()).toBe(403);
      expect((await page.goto("/kyc/kyc-0001"))?.status()).toBe(403);
      expect((await page.request.get("/kyc/api/cases")).status()).toBe(403);
      expect((await page.request.get(api("kyc-0001"))).status()).toBe(403);
      expect((await post(page, api("kyc-0001", "/notes"), { body: "x" })).status()).toBe(403);
    });
  }

  test("unauthenticated API call is 401", async ({ page }) => {
    await page.context().clearCookies();
    expect((await page.request.get("/kyc/api/cases")).status()).toBe(401);
    expect((await post(page, api("kyc-0001", "/decision"), { decision: "APPROVE" })).status()).toBe(401);
  });
});

test.describe("row scoping", () => {
  test("kyc_analyst sees only cases assigned to them (page and API)", async ({ page }) => {
    await loginAs(page, "kyc.analyst1");
    await page.goto("/kyc");
    await expect(page.getByTestId("row-kyc-0001")).toBeVisible();
    await expect(page.getByTestId("row-kyc-0002")).toBeVisible();
    await expect(page.getByTestId("row-kyc-0003")).toHaveCount(0);
    await expect(page.getByTestId("row-kyc-0004")).toHaveCount(0);
    const ids = ((await (await page.request.get("/kyc/api/cases")).json()) as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual(["kyc-0001", "kyc-0002"]);
  });

  test("out-of-scope case is 404, same as nonexistent (page, API, and actions)", async ({ page }) => {
    await loginAs(page, "kyc.analyst1");
    expect((await page.goto("/kyc/kyc-0003"))?.status()).toBe(404);
    expect((await page.goto("/kyc/does-not-exist"))?.status()).toBe(404);
    expect((await page.request.get(api("kyc-0003"))).status()).toBe(404);
    expect((await page.request.get(api("does-not-exist"))).status()).toBe(404);
    expect((await post(page, api("kyc-0003", "/notes"), { body: "peek" })).status()).toBe(404);
    expect((await post(page, api("kyc-0004", "/recommendation"), { recommendation: "APPROVE" })).status()).toBe(404);
    expect((await page.request.get(api("kyc-0001"))).status()).toBe(200);
  });

  for (const key of ["kyc.approver1", "auditor1"] as const) {
    test(`${key} sees all cases`, async ({ page }) => {
      await loginAs(page, key);
      await page.goto("/kyc");
      for (const id of ["0001", "0002", "0003", "0004"]) await expect(page.getByTestId(`row-kyc-${id}`)).toBeVisible();
      expect((await page.request.get(api("kyc-0004"))).status()).toBe(200);
    });
  }
});

test.describe("PII masking (DOB, national ID)", () => {
  const unprivileged: [PersonaKey, keyof typeof RAW][] = [
    ["kyc.analyst1", "kyc-0001"],
    ["kyc.analyst2", "kyc-0003"],
    ["auditor1", "kyc-0001"],
  ];
  for (const [key, id] of unprivileged) {
    test(`${key} (no pii:read) never receives raw PII (HTML, RSC payload, API)`, async ({ page }) => {
      await loginAs(page, key);
      await expectNoRawPii(page, { pagePath: `/kyc/${id}`, apiPaths: [api(id), "/kyc/api/cases"], raw: RAW[id] });
      await expectNoRawPii(page, { pagePath: "/kyc", raw: ALL_RAW });
      await page.goto(`/kyc/${id}`);
      await expect(page.getByTestId("national-id")).toHaveText(`••••${RAW[id][0].slice(-4)}`);
      await expect(page.getByTestId("dob")).toHaveText(`••••${RAW[id][1].slice(-4)}`);
    });
  }

  test("kyc_approver (pii:read) sees raw PII", async ({ page }) => {
    await loginAs(page, "kyc.approver1");
    await page.goto("/kyc/kyc-0001");
    await expect(page.getByTestId("national-id")).toHaveText("TEST-0000-1111");
    await expect(page.getByTestId("dob")).toHaveText("1991-03-14");
    const body = await (await page.request.get(api("kyc-0001"))).text();
    expect(body).toContain("TEST-0000-1111");
  });
});

test.describe("kyc_analyst", () => {
  test("adds a note to an assigned case; audited", async ({ page }) => {
    const since = new Date();
    await loginAs(page, "kyc.analyst1");
    await open(page, "/kyc/kyc-0001");
    await page.getByTestId("note-body").fill("Document photo is blurry, requested a new one");
    await page.getByTestId("add-note").click();
    await expect(page.getByTestId("notes")).toContainText("Document photo is blurry");
    expect((await post(page, api("kyc-0001", "/notes"), { body: "Follow-up received" })).status()).toBe(200);
    expect((await post(page, api("kyc-0001", "/notes"), { body: "" })).status()).toBe(400);
    const actions = await caseActions("kyc-0001", since);
    expect(actions.filter((a) => a === "kyc_case.add_note")).toHaveLength(2);
  });

  test("cannot reassign or make the final decision (403, server-side)", async ({ page }) => {
    await loginAs(page, "kyc.analyst1");
    expect((await post(page, api("kyc-0001", "/assignment"), { assigneeOid: persona("kyc.analyst1").oid })).status()).toBe(403);
    expect((await post(page, api("kyc-0001", "/decision"), { decision: "APPROVE" })).status()).toBe(403);
    await page.goto("/kyc/kyc-0001");
    await expect(page.getByTestId("reassign")).toHaveCount(0);
    await expect(page.getByTestId("approve")).toHaveCount(0);
  });
});

test.describe("maker-checker: analyst recommends, approver decides", () => {
  test("recommendation creates a pending approval; maker cannot decide; a checker approves; all audited", async ({ page }) => {
    const since = new Date();
    await loginAs(page, "kyc.analyst1");
    await open(page, "/kyc/kyc-0002");
    await page.getByTestId("recommendation-select").selectOption("APPROVE");
    await page.getByTestId("recommend").click();
    await expect(page.getByTestId("status")).toHaveText("Pending approval");
    await expect(page.getByTestId("approve")).toHaveCount(0);
    expect((await post(page, api("kyc-0002", "/decision"), { decision: "APPROVE" })).status()).toBe(403);
    expect((await post(page, api("kyc-0002", "/recommendation"), { recommendation: "REJECT" })).status()).toBe(409);

    const approval = await db.approval.findFirstOrThrow({ where: { entityType: "KycCase", entityId: "kyc-0002", status: "PENDING" } });
    expect(approval.action).toBe("kyc_case.final_decision");
    expect(approval.requesterOid).toBe(persona("kyc.analyst1").oid);

    await loginAs(page, "kyc.approver1");
    await open(page, "/kyc/kyc-0002");
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("status")).toHaveText("Approved");
    const decided = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(decided.status).toBe("APPROVED");
    expect(decided.deciderOid).toBe(persona("kyc.approver1").oid);
    expect((await post(page, api("kyc-0002", "/decision"), { decision: "REJECT" })).status()).toBe(409);

    expect(await caseActions("kyc-0002", since)).toEqual(expect.arrayContaining(["kyc_case.recommend", "kyc_case.approve"]));
    const approvalActions = (await db.auditLog.findMany({ where: { entityType: "Approval", entityId: approval.id } })).map((a) => a.action);
    expect(approvalActions).toEqual(expect.arrayContaining(["approval.requested", "approval.approved"]));
  });

  test("kyc_approver cannot recommend or add notes (no kyc:write)", async ({ page }) => {
    await loginAs(page, "kyc.approver1");
    expect((await post(page, api("kyc-0001", "/recommendation"), { recommendation: "APPROVE" })).status()).toBe(403);
    expect((await post(page, api("kyc-0001", "/notes"), { body: "x" })).status()).toBe(403);
  });

  test("approver cannot decide a case they recommended themselves; another approver can", async ({ page }) => {
    // Simulates a user who holds both roles: the recommendation on kyc-0004 was made by kyc.approver1.
    const self = persona("kyc.approver1");
    await db.kycCase.update({ where: { id: "kyc-0004" }, data: { status: "PENDING_APPROVAL", recommendation: "REJECT", recommendedByOid: self.oid } });
    await db.approval.create({
      data: { entityType: "KycCase", entityId: "kyc-0004", action: "kyc_case.final_decision", requesterOid: self.oid, requesterUsername: self.preferred_username },
    });

    await loginAs(page, "kyc.approver1");
    expect((await post(page, api("kyc-0004", "/decision"), { decision: "APPROVE" })).status()).toBe(403);
    expect((await post(page, api("kyc-0004", "/decision"), { decision: "REJECT" })).status()).toBe(403);
    await page.goto("/kyc/kyc-0004");
    await expect(page.getByTestId("approve")).toHaveCount(0);
    await expect(page.getByTestId("own-recommendation")).toBeVisible();
    await expect(page.getByTestId("status")).toHaveText("Pending approval");

    await loginAs(page, "kyc.approver2");
    const res = await post(page, api("kyc-0004", "/decision"), { decision: "REJECT", comment: "Agree" });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("REJECTED");
  });

  test("DB CHECK rejects the requester deciding their own approval", async () => {
    const requester = persona("kyc.analyst2");
    const a = await db.approval.create({
      data: { entityType: "KycCase", entityId: "kyc-0003", action: "kyc_case.db_check_probe", requesterOid: requester.oid, requesterUsername: requester.preferred_username },
    });
    await expect(db.approval.update({ where: { id: a.id }, data: { status: "APPROVED", deciderOid: a.requesterOid } })).rejects.toThrow(
      /approval_decider_not_requester/,
    );
    await db.approval.delete({ where: { id: a.id } });
  });
});

test.describe("kyc_approver reassigns", () => {
  test("reassign moves the case between analysts' scopes; audited; invalid target is 400", async ({ page }) => {
    const since = new Date();
    await loginAs(page, "kyc.approver1");
    await open(page, "/kyc/kyc-0003");
    await page.getByTestId("assignee-select").selectOption(persona("kyc.analyst1").oid);
    await page.getByTestId("reassign").click();
    await expect(page.getByTestId("assignee")).toHaveText(persona("kyc.analyst1").name);
    expect((await post(page, api("kyc-0003", "/assignment"), { assigneeOid: persona("auditor1").oid })).status()).toBe(400);
    expect((await post(page, api("kyc-0001", "/assignment"), { assigneeOid: persona("kyc.analyst1").oid })).status()).toBe(409);
    expect(await caseActions("kyc-0003", since)).toEqual(["kyc_case.reassign"]);

    await loginAs(page, "kyc.analyst1");
    expect((await page.goto("/kyc/kyc-0003"))?.status()).toBe(200);
    await loginAs(page, "kyc.analyst2");
    expect((await page.goto("/kyc/kyc-0003"))?.status()).toBe(404);
  });
});

test.describe("auditor is read-only", () => {
  test("every write is 403 and no controls are shown", async ({ page }) => {
    await loginAs(page, "auditor1");
    expect((await post(page, api("kyc-0001", "/notes"), { body: "x" })).status()).toBe(403);
    expect((await post(page, api("kyc-0001", "/recommendation"), { recommendation: "APPROVE" })).status()).toBe(403);
    expect((await post(page, api("kyc-0001", "/assignment"), { assigneeOid: persona("kyc.analyst2").oid })).status()).toBe(403);
    expect((await post(page, api("kyc-0001", "/decision"), { decision: "APPROVE" })).status()).toBe(403);
    await page.goto("/kyc/kyc-0001");
    for (const id of ["add-note", "recommend", "reassign", "approve", "reject"]) await expect(page.getByTestId(id)).toHaveCount(0);
  });

  test("audit viewer shows kyc entries with PII masked for the auditor", async ({ page }) => {
    // kyc.approver1 (pii:read) wrote the kyc-0002 approve entry, so its before/after hold raw PII.
    await loginAs(page, "auditor1");
    await page.goto("/audit?entityType=KycCase&entityId=kyc-0002");
    await expect(page.getByTestId("audit-table")).toContainText("kyc_case.approve");
    await expectNoRawPii(page, { pagePath: "/audit?entityType=KycCase&entityId=kyc-0002", raw: RAW["kyc-0002"] });
  });
});

test.describe("concurrency, input hardening and reseeding", () => {
  test("concurrent recommendations: exactly one wins, one pending approval", async ({ page }) => {
    await seedKyc(db);
    await loginAs(page, "kyc.analyst1");
    const results = await Promise.all(
      (["APPROVE", "REJECT", "APPROVE"] as const).map((recommendation) => post(page, api("kyc-0001", "/recommendation"), { recommendation })),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409, 409]);
    expect(await db.approval.count({ where: { entityType: "KycCase", entityId: "kyc-0001", status: "PENDING" } })).toBe(1);
    expect((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-0001" } })).status).toBe("PENDING_APPROVAL");
  });

  test("decide and reassign race: a finalized case is never reassigned or reopened", async ({ page, browser }) => {
    // kyc-0001 is PENDING_APPROVAL from the previous test.
    await loginAs(page, "kyc.approver1");
    const other = await browser.newPage();
    await loginAs(other, "kyc.approver2");
    const [decision, reassignment] = await Promise.all([
      post(page, api("kyc-0001", "/decision"), { decision: "APPROVE" }),
      post(other, api("kyc-0001", "/assignment"), { assigneeOid: persona("kyc.analyst2").oid }),
    ]);
    expect(decision.status()).toBe(200);
    const final = await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-0001" } });
    expect(final.status).toBe("APPROVED");
    if (reassignment.status() !== 200) expect(reassignment.status()).toBe(409);
    expect((await post(other, api("kyc-0001", "/assignment"), { assigneeOid: persona("kyc.analyst1").oid })).status()).toBe(409);
    await other.close();
  });

  test("JSON routes reject non-JSON media types (no simple-request CSRF)", async ({ page }) => {
    await loginAs(page, "kyc.analyst1");
    for (const contentType of ["text/plain; charset=application/json", "text/plain", "application/x-www-form-urlencoded"]) {
      const res = await page.request.post(api("kyc-0002", "/notes"), { data: JSON.stringify({ body: "csrf" }), headers: { "content-type": contentType } });
      expect(res.status()).toBe(400);
    }
    const ok = await page.request.post(api("kyc-0002", "/notes"), { data: JSON.stringify({ body: "ok" }), headers: { "content-type": "Application/JSON; charset=utf-8" } });
    expect(ok.status()).toBe(200);
  });

  test("reseeding a case with a pending recommendation leaves it workable", async ({ page }) => {
    await seedKyc(db);
    await loginAs(page, "kyc.analyst1");
    expect((await post(page, api("kyc-0002", "/recommendation"), { recommendation: "REJECT" })).status()).toBe(200);
    await seedKyc(db);
    expect(await db.approval.count({ where: { entityType: "KycCase", entityId: "kyc-0002", status: "PENDING" } })).toBe(0);
    expect((await post(page, api("kyc-0002", "/recommendation"), { recommendation: "APPROVE" })).status()).toBe(200);
    await loginAs(page, "kyc.approver1");
    expect((await post(page, api("kyc-0002", "/decision"), { decision: "APPROVE" })).status()).toBe(200);
  });
});
