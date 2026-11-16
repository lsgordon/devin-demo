import { expect, test, type Page } from "@playwright/test";
import { persona, type PersonaKey } from "../src/platform/auth/personas";
import { buildUser } from "../src/platform/authz/core";
import { maskForUser } from "../src/platform/pii/mask";
import manifest from "../src/apps/refunds/manifest";
import seed from "../src/apps/refunds/seed";
import { db, expectNoRawPii, login, rscPayload } from "./helpers";

// Seeded (src/apps/refunds/seed.ts). agent1 owns 0001, 0002, 0005; agent2 owns 0003, 0004, 0006.
const SEED_EMAILS = [
  "testy.mctestface@example.com", "sample.oplaceholder@example.com", "fakey.mcfakeface@example.com",
  "demo.mcdemoface@example.com", "placeholder.person@example.com", "example.user@example.com",
];
const SEED_CARDS = ["4242", "5454", "3782", "6011", "3056", "6331"];
const ALL_IDS = ["refund-0001", "refund-0002", "refund-0003", "refund-0004", "refund-0005", "refund-0006"];
const AGENT1_IDS = ["refund-0001", "refund-0002", "refund-0005"];

type Refund = { id: string; status: string; autoApproved: boolean; customerEmail: string; cardLast4: string; decidedByOid: string | null };
type ListResponse = { rows: Refund[]; totals: { count: number; amountCents: number; byStatus: Record<string, { count: number; amountCents: number }> } };

let seq = 0;
const newRefund = (over: Record<string, unknown> = {}) => ({
  orderId: `ORD-E2E-${Date.now()}-${++seq}`,
  customerEmail: `e2e.customer${seq}@example.com`,
  cardLast4: "0000",
  amount: "250.00",
  reason: "DAMAGED",
  note: "e2e",
  ...over,
});

async function createViaApi(page: Page, over: Record<string, unknown> = {}) {
  const res = await page.request.post("/refunds/api/requests", { data: newRefund(over) });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Refund;
}

const decide = (page: Page, id: string, decision: "APPROVED" | "REJECTED", comment = "e2e") =>
  page.request.post(`/refunds/api/requests/${id}/decision`, { data: { decision, comment } });

async function listIds(page: Page, query = "") {
  const res = await page.request.get(`/refunds/api/requests${query}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as ListResponse).rows.map((r) => r.id);
}

async function auditActions(entityId: string) {
  const approvals = await db.approval.findMany({ where: { entityType: "RefundRequest", entityId } });
  const rows = await db.auditLog.findMany({
    where: { OR: [{ entityType: "RefundRequest", entityId }, { entityType: "Approval", entityId: { in: approvals.map((a) => a.id) } }] },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.action);
}

/** Card last-4 is only 4 digits, so look for it as a rendered/serialized value, not any substring. */
async function expectNoRawCards(page: Page, opts: { pagePath: string; apiPaths?: string[]; raw: string[] }) {
  const html = await (await page.request.get(opts.pagePath)).text();
  const rsc = await rscPayload(page, opts.pagePath);
  const apis = await Promise.all((opts.apiPaths ?? []).map(async (p) => (await page.request.get(p)).text()));
  for (const c of opts.raw) {
    expect(html, `raw card ${c} in HTML of ${opts.pagePath}`).not.toContain(`>${c}<`);
    expect(rsc, `raw card ${c} in RSC payload of ${opts.pagePath}`).not.toContain(`"${c}"`);
    for (const body of apis) expect(body, `raw card ${c} in API response`).not.toContain(`"${c}"`);
  }
}

test.beforeAll(async () => {
  await db.approval.deleteMany({ where: { entityType: "RefundRequest" } });
  await db.refundRequest.deleteMany({});
  await seed(db);
});
test.afterAll(async () => db.$disconnect());

test.describe("who can open the app", () => {
  for (const key of ["noroles", "flags.admin1", "kyc.analyst1", "kyc.approver1"] as const) {
    test(`${key} gets 403 (page and API)`, async ({ page }) => {
      await login(page, key);
      expect((await page.goto("/refunds"))?.status()).toBe(403);
      expect((await page.goto("/refunds/refund-0001"))?.status()).toBe(403);
      expect((await page.request.get("/refunds/api/requests")).status()).toBe(403);
      expect((await page.request.get("/refunds/api/requests/refund-0001")).status()).toBe(403);
      expect((await page.request.post("/refunds/api/requests", { data: newRefund({ amount: "10" }) })).status()).toBe(403);
      expect((await decide(page, "refund-0002", "APPROVED")).status()).toBe(403);
    });
  }

  for (const key of ["refunds.agent1", "refunds.approver1", "auditor1"] as const) {
    test(`${key} can open the app`, async ({ page }) => {
      await login(page, key);
      expect((await page.goto("/refunds"))?.status()).toBe(200);
      await expect(page.getByTestId("refund-list")).toBeVisible();
    });
  }
});

test.describe("row scoping", () => {
  test("agent sees only the requests they created (page and API)", async ({ page }) => {
    await login(page, "refunds.agent1");
    await page.goto("/refunds?q=ORD-TEST");
    for (const id of ALL_IDS) await expect(page.getByTestId(`row-${id}`)).toHaveCount(AGENT1_IDS.includes(id) ? 1 : 0);
    expect((await listIds(page, "?q=ORD-TEST")).sort()).toEqual(AGENT1_IDS);
  });

  test("out-of-scope request is 404, same as nonexistent (page and API)", async ({ page }) => {
    await login(page, "refunds.agent1");
    expect((await page.goto("/refunds/refund-0003"))?.status()).toBe(404);
    expect((await page.goto("/refunds/does-not-exist"))?.status()).toBe(404);
    expect((await page.request.get("/refunds/api/requests/refund-0003")).status()).toBe(404);
    expect((await page.request.get("/refunds/api/requests/does-not-exist")).status()).toBe(404);
    expect((await page.goto("/refunds/refund-0001"))?.status()).toBe(200);
    expect((await page.request.get("/refunds/api/requests/refund-0001")).status()).toBe(200);
  });

  for (const key of ["refunds.approver1", "auditor1"] as const) {
    test(`${key} (refunds:read_all) sees all requests`, async ({ page }) => {
      await login(page, key);
      await page.goto("/refunds?q=ORD-TEST");
      for (const id of ALL_IDS) await expect(page.getByTestId(`row-${id}`)).toBeVisible();
      expect((await listIds(page, "?q=ORD-TEST")).sort()).toEqual(ALL_IDS);
    });
  }
});

test.describe("filters and totals", () => {
  test("status filter and totals (API)", async ({ page }) => {
    await login(page, "refunds.approver1");
    const res = await page.request.get("/refunds/api/requests?q=ORD-TEST&status=PENDING_APPROVAL");
    const body = (await res.json()) as ListResponse;
    expect(body.rows.map((r) => r.id)).toEqual(["refund-0003", "refund-0002"]);
    expect(body.totals.count).toBe(2);
    expect(body.totals.amountCents).toBe(40000);
  });

  test("amount range filter and per-status totals (API)", async ({ page }) => {
    await login(page, "refunds.approver1");
    const body = (await (await page.request.get("/refunds/api/requests?q=ORD-TEST&min=100.01&max=1200")).json()) as ListResponse;
    expect(body.rows.map((r) => r.id).sort()).toEqual(["refund-0002", "refund-0003", "refund-0004", "refund-0005"]);
    expect(body.totals).toEqual({
      count: 4,
      amountCents: 210000,
      byStatus: {
        PENDING_APPROVAL: { count: 2, amountCents: 40000 },
        APPROVED: { count: 1, amountCents: 50000 },
        REJECTED: { count: 1, amountCents: 120000 },
      },
    });
    expect((await listIds(page, "?q=ORD-TEST&reason=DAMAGED")).sort()).toEqual(["refund-0001", "refund-0006"]);
  });

  test("filters and totals in the UI, totals respect row scope", async ({ page }) => {
    await login(page, "refunds.approver1");
    await page.goto("/refunds?q=ORD-TEST");
    await page.getByLabel("Status").selectOption("PENDING_APPROVAL");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/status=PENDING_APPROVAL/);
    await expect(page.getByTestId("total-count")).toHaveText("2");
    await expect(page.getByTestId("total-amount")).toHaveText("$400.00");
    await expect(page.getByTestId("row-refund-0001")).toHaveCount(0);

    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/refunds$/);
    await expect(page.getByLabel("Status")).toHaveValue("");
    await expect(page.getByLabel("Order id")).toHaveValue("");

    await login(page, "refunds.agent1");
    await page.goto("/refunds?q=ORD-TEST");
    await expect(page.getByTestId("total-count")).toHaveText("3");
    await expect(page.getByTestId("total-amount")).toHaveText("$1,469.99");
  });
});

test.describe("creating refunds (refunds_agent)", () => {
  test("≤ $100 auto-approves (UI), audited, no approval row", async ({ page }) => {
    await login(page, "refunds.agent1");
    await page.goto("/refunds");
    await page.getByTestId("new-refund").click();
    await expect(page.getByTestId("new-refund-form")).toBeVisible();
    const input = newRefund({ amount: "100.00" });
    await page.getByLabel("Order id").fill(input.orderId as string);
    await page.getByLabel("Customer email").fill(input.customerEmail as string);
    await page.getByLabel("Card last 4").fill("1111");
    await page.getByLabel("Amount ($)").fill("100.00");
    await page.getByLabel("Reason").selectOption("DAMAGED");
    await page.getByTestId("create-refund").click();
    await expect(page).toHaveURL(/\/refunds\/(?!new)[^/]+$/);
    await expect(page.getByTestId("status")).toHaveText("Approved");
    await expect(page.getByTestId("auto-approved")).toBeVisible();

    const row = await db.refundRequest.findFirstOrThrow({ where: { orderId: input.orderId as string } });
    expect(row).toMatchObject({ amountCents: 10000, status: "APPROVED", autoApproved: true, createdByOid: persona("refunds.agent1").oid });
    expect(await db.approval.count({ where: { entityType: "RefundRequest", entityId: row.id } })).toBe(0);
    expect(await auditActions(row.id)).toEqual(["refund_request.create", "refund_request.auto_approve"]);
  });

  test("> $100 requires approval (API), audited", async ({ page }) => {
    await login(page, "refunds.agent1");
    const created = await createViaApi(page, { amount: "100.01" });
    expect(created).toMatchObject({ status: "PENDING_APPROVAL", autoApproved: false });
    const approval = await db.approval.findFirstOrThrow({ where: { entityType: "RefundRequest", entityId: created.id } });
    expect(approval).toMatchObject({ status: "PENDING", requesterOid: persona("refunds.agent1").oid });
    expect(await auditActions(created.id)).toEqual(["refund_request.create", "approval.requested"]);
  });

  test("client cannot set status/autoApproved/owner (server decides)", async ({ page }) => {
    await login(page, "refunds.agent1");
    const created = await createViaApi(page, {
      amount: "500", status: "APPROVED", autoApproved: true, createdByOid: persona("refunds.agent2").oid,
    });
    const row = await db.refundRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ status: "PENDING_APPROVAL", autoApproved: false, createdByOid: persona("refunds.agent1").oid });
  });

  test("invalid input is rejected with 400 and nothing is written", async ({ page }) => {
    await login(page, "refunds.agent1");
    const before = await db.refundRequest.count();
    for (const bad of [
      { amount: "0" }, { amount: "-5" }, { amount: "1.234" }, { amount: "abc" },
      { cardLast4: "12a4" }, { cardLast4: "12345" }, { cardLast4: "••••" },
      { customerEmail: "not-an-email" }, { reason: "BECAUSE" }, { orderId: "" },
    ]) {
      const res = await page.request.post("/refunds/api/requests", { data: newRefund(bad) });
      expect(res.status(), JSON.stringify(bad)).toBe(400);
    }
    expect(await db.refundRequest.count()).toBe(before);
  });

  test("invalid input shows a form error in the UI", async ({ page }) => {
    await login(page, "refunds.agent1");
    await page.goto("/refunds/new");
    await page.getByLabel("Order id").fill("ORD-E2E-FORM");
    await page.getByLabel("Customer email").fill("form@example.com");
    await page.getByLabel("Card last 4").fill("1234");
    await page.getByLabel("Amount ($)").fill("1.999");
    await page.getByLabel("Reason").selectOption("OTHER");
    await page.getByTestId("create-refund").click();
    await expect(page.getByTestId("form-error")).toContainText("Amount");
    await expect(page.getByLabel("Order id")).toHaveValue("ORD-E2E-FORM");
    await expect(page.getByLabel("Customer email")).toHaveValue("form@example.com");
    await expect(page.getByLabel("Amount ($)")).toHaveValue("1.999");
    await expect(page.getByLabel("Reason")).toHaveValue("OTHER");
    expect(await db.refundRequest.count({ where: { orderId: "ORD-E2E-FORM" } })).toBe(0);
  });
});

test.describe("maker-checker (refunds_approver)", () => {
  test("maker cannot approve their own request (UI hidden and server 403)", async ({ page }) => {
    await login(page, "refunds.agent1");
    const created = await createViaApi(page);
    await page.goto(`/refunds/${created.id}`);
    await expect(page.getByTestId("status")).toHaveText("Pending approval");
    await expect(page.getByTestId("approve")).toHaveCount(0);
    expect((await decide(page, created.id, "APPROVED")).status()).toBe(403);
    expect((await db.refundRequest.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("PENDING_APPROVAL");
  });

  test("a different approver approves (UI); every step audited", async ({ page }) => {
    await login(page, "refunds.agent1");
    const created = await createViaApi(page, { amount: "250.00" });

    await login(page, "refunds.approver2");
    await page.goto(`/refunds/${created.id}`);
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("status")).toHaveText("Approved");

    const row = await db.refundRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ status: "APPROVED", autoApproved: false, decidedByOid: persona("refunds.approver2").oid });
    const approval = await db.approval.findFirstOrThrow({ where: { entityType: "RefundRequest", entityId: created.id } });
    expect(approval).toMatchObject({ status: "APPROVED", requesterOid: persona("refunds.agent1").oid, deciderOid: persona("refunds.approver2").oid });
    expect(await auditActions(created.id)).toEqual([
      "refund_request.create", "approval.requested", "approval.approved", "refund_request.approve",
    ]);
  });

  test("approver rejects (API); deciding twice is 409; auto-approved refunds cannot be decided", async ({ page }) => {
    await login(page, "refunds.agent2");
    const created = await createViaApi(page, { amount: "999.99" });

    await login(page, "refunds.approver1");
    const res = await decide(page, created.id, "REJECTED", "Not eligible");
    expect(res.status()).toBe(200);
    expect(((await res.json()) as Refund).status).toBe("REJECTED");
    expect((await decide(page, created.id, "APPROVED")).status()).toBe(409);
    expect((await decide(page, "refund-0001", "APPROVED")).status()).toBe(409);
    expect((await decide(page, "does-not-exist", "APPROVED")).status()).toBe(404);
    expect((await page.request.post(`/refunds/api/requests/${created.id}/decision`, { data: { decision: "MAYBE" } })).status()).toBe(400);
    expect(await auditActions(created.id)).toEqual([
      "refund_request.create", "approval.requested", "approval.rejected", "refund_request.reject",
    ]);
  });

  test("approver cannot create refunds (403, page and API)", async ({ page }) => {
    await login(page, "refunds.approver1");
    await page.goto("/refunds");
    await expect(page.getByTestId("new-refund")).toHaveCount(0);
    expect((await page.goto("/refunds/new"))?.status()).toBe(403);
    expect((await page.request.post("/refunds/api/requests", { data: newRefund({ amount: "10" }) })).status()).toBe(403);
  });

  test("approver cannot approve a request they made (e.g. a user holding both roles)", async ({ page }) => {
    // No persona holds refunds_agent + refunds_approver, so insert a request made by approver1 directly.
    const a1 = persona("refunds.approver1");
    const id = `refund-e2e-own-${Date.now()}`;
    await db.refundRequest.create({
      data: { id, orderId: "ORD-E2E-OWN", customerEmail: "own@example.com", cardLast4: "2222", amountCents: 30000, reason: "OTHER", status: "PENDING_APPROVAL", createdByOid: a1.oid, createdByUsername: a1.preferred_username },
    });
    await db.approval.create({
      data: { entityType: "RefundRequest", entityId: id, action: "refund_request.approve", requesterOid: a1.oid, requesterUsername: a1.preferred_username },
    });

    await login(page, "refunds.approver1");
    await page.goto(`/refunds/${id}`);
    await expect(page.getByTestId("status")).toHaveText("Pending approval");
    await expect(page.getByTestId("approve")).toHaveCount(0);
    expect((await decide(page, id, "APPROVED")).status()).toBe(403);
    expect((await decide(page, id, "REJECTED")).status()).toBe(403);
    expect((await db.refundRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_APPROVAL");

    await login(page, "refunds.approver2");
    expect((await decide(page, id, "APPROVED")).status()).toBe(200);
  });

  test("DB CHECKs reject self-approval and over-limit auto-approval", async () => {
    const a = await db.approval.findUniqueOrThrow({ where: { id: "refund-approval-0004" } });
    await expect(db.approval.update({ where: { id: a.id }, data: { deciderOid: a.requesterOid } })).rejects.toThrow(/approval_decider_not_requester/);
    const r = await db.refundRequest.findUniqueOrThrow({ where: { id: "refund-0002" } });
    await expect(db.refundRequest.update({ where: { id: r.id }, data: { decidedByOid: r.createdByOid } })).rejects.toThrow(/refund_request_decider_not_creator/);
    await expect(db.refundRequest.update({ where: { id: r.id }, data: { autoApproved: true, status: "APPROVED" } })).rejects.toThrow(/refund_request_auto_approve_limit/);
  });
});

test.describe("auditor is read-only", () => {
  test("can read list, detail and audit; every write is 403", async ({ page }) => {
    await login(page, "auditor1");
    await page.goto("/refunds");
    await expect(page.getByTestId("row-refund-0002")).toBeVisible();
    await expect(page.getByTestId("new-refund")).toHaveCount(0);
    expect((await page.goto("/refunds/refund-0002"))?.status()).toBe(200);
    await expect(page.getByTestId("decision-form")).toHaveCount(0);
    expect((await page.goto("/refunds/new"))?.status()).toBe(403);
    expect((await page.request.post("/refunds/api/requests", { data: newRefund({ amount: "10" }) })).status()).toBe(403);
    expect((await decide(page, "refund-0002", "APPROVED")).status()).toBe(403);
    expect((await decide(page, "refund-0002", "REJECTED")).status()).toBe(403);
    expect((await db.refundRequest.findUniqueOrThrow({ where: { id: "refund-0002" } })).status).toBe("PENDING_APPROVAL");
    expect((await page.goto("/audit?entityType=RefundRequest"))?.status()).toBe(200);
  });
});

test.describe("PII masking (card last-4, customer email)", () => {
  const cases: { key: PersonaKey; detail: string; emails: string[]; cards: string[] }[] = [
    { key: "refunds.agent1", detail: "refund-0001", emails: SEED_EMAILS, cards: SEED_CARDS },
    { key: "refunds.approver1", detail: "refund-0003", emails: SEED_EMAILS, cards: SEED_CARDS },
    { key: "auditor1", detail: "refund-0004", emails: SEED_EMAILS, cards: SEED_CARDS },
  ];
  for (const c of cases) {
    test(`${c.key} (no pii:read) never receives raw PII (HTML, RSC payload, API)`, async ({ page }) => {
      await login(page, c.key);
      const apiPaths = ["/refunds/api/requests", `/refunds/api/requests/${c.detail}`];
      for (const pagePath of ["/refunds", `/refunds/${c.detail}`]) {
        await expectNoRawPii(page, { pagePath, apiPaths, raw: c.emails });
        await expectNoRawCards(page, { pagePath, apiPaths, raw: c.cards });
      }
      await page.goto(`/refunds/${c.detail}`);
      await expect(page.getByTestId("card-last4")).toHaveText("••••");
      await expect(page.getByTestId("customer-email")).toHaveText("••••.com");
    });
  }

  test("refunds created by an agent are masked in their response and in the audit log", async ({ page }) => {
    await login(page, "refunds.agent1");
    const created = await createViaApi(page, { customerEmail: "audit.trail.check@example.com", cardLast4: "7319", amount: "300" });
    expect(created.customerEmail).toBe("••••.com");
    expect(created.cardLast4).toBe("••••");
    const raw = await db.refundRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(raw).toMatchObject({ customerEmail: "audit.trail.check@example.com", cardLast4: "7319" });

    await login(page, "refunds.approver2");
    expect((await decide(page, created.id, "APPROVED")).status()).toBe(200);

    await login(page, "auditor1");
    const pagePath = `/audit?entityType=RefundRequest&entityId=${created.id}`;
    await expectNoRawPii(page, { pagePath, raw: ["audit.trail.check@example.com"] });
    await expectNoRawCards(page, { pagePath, raw: ["7319"] });
  });

  test("manifest masks both fields unless the user has pii:read", () => {
    const pii = new Map(Object.entries(manifest.pii));
    const row = { customerEmail: "testy.mctestface@example.com", cardLast4: "4242", orderId: "ORD-TEST-0001" };
    const user = (roles: string[]) => buildUser({ oid: "x", tid: "t", username: "u", name: "n", roles });
    for (const role of ["refunds_agent", "refunds_approver", "auditor"]) {
      expect(maskForUser(user([role]), "RefundRequest", row, pii)).toEqual({ ...row, customerEmail: "••••.com", cardLast4: "••••" });
    }
    // kyc_approver is the only role with pii:read by default (PII_READ_ROLES); it is not a refunds role.
    expect(maskForUser(user(["kyc_approver"]), "RefundRequest", row, pii)).toEqual(row);
  });
});
