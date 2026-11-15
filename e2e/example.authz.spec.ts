import { expect, test } from "@playwright/test";
import { persona } from "../src/platform/auth/personas";
import { db, expectNoRawPii, login } from "./helpers";

// Reference app spec. Every new app copies this shape into e2e/<app>.authz.spec.ts.

const RAW_0001 = ["TEST-0000-1234", "1990-01-01"];

test.beforeAll(async () => {
  await db.approval.deleteMany({ where: { entityType: "ExampleRequest" } });
  await db.exampleRequest.updateMany({ data: { status: "DRAFT" } });
});
test.afterAll(async () => db.$disconnect());

test.describe("row scoping", () => {
  test("analyst sees only rows assigned to them", async ({ page }) => {
    await login(page, "kyc.analyst1");
    await page.goto("/example");
    await expect(page.getByTestId("row-example-0001")).toBeVisible();
    await expect(page.getByTestId("row-example-0002")).toBeVisible();
    await expect(page.getByTestId("row-example-0003")).toHaveCount(0);
    await expect(page.getByTestId("row-example-0004")).toHaveCount(0);
  });

  test("approver sees all rows", async ({ page }) => {
    await login(page, "kyc.approver1");
    await page.goto("/example");
    for (const id of ["0001", "0002", "0003", "0004"]) await expect(page.getByTestId(`row-example-${id}`)).toBeVisible();
  });

  test("out-of-scope row is 404 (same as nonexistent), page and API", async ({ page }) => {
    await login(page, "kyc.analyst1");
    expect((await page.goto("/example/example-0003"))?.status()).toBe(404);
    expect((await page.goto("/example/does-not-exist"))?.status()).toBe(404);
    expect((await page.request.get("/example/api/requests/example-0003")).status()).toBe(404);
    expect((await page.request.get("/example/api/requests/does-not-exist")).status()).toBe(404);
    expect((await page.request.get("/example/api/requests/example-0001")).status()).toBe(200);
  });

  test("missing permission is 403, page and API", async ({ page }) => {
    await login(page, "flags.admin1");
    expect((await page.goto("/example/example-0001"))?.status()).toBe(403);
    expect((await page.request.get("/example/api/requests/example-0001")).status()).toBe(403);
  });
});

test.describe("PII masking", () => {
  for (const key of ["kyc.analyst1", "refunds.approver1", "auditor1"] as const) {
    test(`${key} never receives raw PII (HTML, RSC payload, API)`, async ({ page }) => {
      await login(page, key);
      await expectNoRawPii(page, {
        pagePath: "/example/example-0001",
        apiPaths: ["/example/api/requests/example-0001"],
        raw: RAW_0001,
      });
      await expectNoRawPii(page, { pagePath: "/example", raw: RAW_0001 });
      await page.goto("/example/example-0001");
      await expect(page.getByTestId("id-number")).toHaveText("••••1234");
    });
  }

  test("kyc_approver (pii:read) sees raw PII", async ({ page }) => {
    await login(page, "kyc.approver1");
    await page.goto("/example/example-0001");
    await expect(page.getByTestId("id-number")).toHaveText("TEST-0000-1234");
    await expect(page.getByTestId("dob")).toHaveText("1990-01-01");
  });
});

test.describe("maker-checker", () => {
  test("maker submits, cannot approve; checker approves; both audited; auditor sees masked audit", async ({ page }) => {
    await login(page, "kyc.analyst1");
    await page.goto("/example/example-0002");
    await page.getByTestId("submit-for-approval").click();
    await expect(page.getByTestId("status")).toHaveText("Pending approval");
    await expect(page.getByTestId("approve")).toHaveCount(0);

    await login(page, "kyc.approver1");
    await page.goto("/example/example-0002");
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("status")).toHaveText("Approved");

    const approval = await db.approval.findFirstOrThrow({ where: { entityId: "example-0002" }, orderBy: { createdAt: "desc" } });
    expect(approval.requesterOid).toBe(persona("kyc.analyst1").oid);
    expect(approval.deciderOid).toBe(persona("kyc.approver1").oid);
    const actions = (await db.auditLog.findMany({ where: { OR: [{ entityId: "example-0002" }, { entityId: approval.id }] } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["approval.requested", "example_request.submit", "approval.approved", "example_request.approved"]));

    // The approver has pii:read, so their audit rows hold raw PII; the auditor must still see it masked.
    await login(page, "auditor1");
    await expectNoRawPii(page, { pagePath: "/audit?entityType=ExampleRequest&entityId=example-0002", raw: ["TEST-0000-5678", "1985-05-05"] });
  });

  test("DB CHECK rejects requester deciding their own approval", async () => {
    const a = await db.approval.findFirstOrThrow({ where: { entityId: "example-0002" } });
    await expect(
      db.approval.update({ where: { id: a.id }, data: { deciderOid: a.requesterOid } }),
    ).rejects.toThrow(/approval_decider_not_requester/);
  });
});
