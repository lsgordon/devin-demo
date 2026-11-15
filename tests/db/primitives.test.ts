/** Integration tests against Postgres (docker compose up + prisma migrate). */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/platform/db/client";
import { buildUser } from "@/platform/authz/core";
import { ForbiddenError, NotFoundError, ConflictError } from "@/platform/authz/errors";
import { persona } from "@/platform/auth/personas";
import { mutate, scopedDb } from "@/platform/data";
import { decideApproval, requestApproval } from "@/platform/approvals";
import { MASK } from "@/platform/pii/mask";

const u = (k: Parameters<typeof persona>[0]) => {
  const p = persona(k);
  return buildUser({ oid: p.oid, tid: "t", username: p.preferred_username, name: p.name, roles: p.roles });
};
const analyst1 = u("kyc.analyst1");
const approver1 = u("kyc.approver1");
const refundsApprover = u("refunds.approver1");
const ENTITY = { entityType: "VitestThing", entityId: "vt-1", action: "vitest.do" };

beforeEach(async () => {
  await db.approval.deleteMany({ where: { entityType: "VitestThing" } });
  await db.exampleRequest.upsert({
    where: { id: "vitest-0001" },
    create: { id: "vitest-0001", title: "vitest", customerName: "Testy McTestface", dateOfBirth: "1999-09-09", idNumber: "TEST-0000-7777", amountCents: 1, assigneeOid: analyst1.oid },
    update: { status: "DRAFT", idNumber: "TEST-0000-7777", assigneeOid: analyst1.oid },
  });
});
afterAll(async () => {
  await db.exampleRequest.deleteMany({ where: { id: "vitest-0001" } });
  await db.$disconnect();
});

describe("audit log", () => {
  it("is written in the same transaction as the mutation (rollback removes both)", async () => {
    const marker = `vitest.rollback.${Date.now()}`;
    await expect(
      mutate(analyst1, async ({ tx, audit }) => {
        await tx.exampleRequest.update({ where: { id: "vitest-0001" }, data: { title: marker } });
        await audit({ action: marker, entityType: "ExampleRequest", entityId: "vitest-0001" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.auditLog.count({ where: { action: marker } })).toBe(0);
    expect((await db.exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).title).toBe("vitest");
  });

  it("records actor, action, entity and before/after", async () => {
    const action = `vitest.update.${Date.now()}`;
    await mutate(analyst1, async ({ tx, audit }) => {
      const before = await tx.exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } });
      const after = await tx.exampleRequest.update({ where: { id: "vitest-0001" }, data: { amountCents: 2 } });
      await audit({ action, entityType: "ExampleRequest", entityId: after.id, before, after });
    });
    const row = await db.auditLog.findFirstOrThrow({ where: { action } });
    expect(row).toMatchObject({ actorOid: analyst1.oid, actorUsername: analyst1.username, entityType: "ExampleRequest", entityId: "vitest-0001" });
    expect((row.before as { amountCents: number }).amountCents).toBe(1);
    expect((row.after as { amountCents: number }).amountCents).toBe(2);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("mutate() refuses to commit a mutation without an audit entry", async () => {
    await expect(
      mutate(analyst1, async ({ tx }) => tx.exampleRequest.update({ where: { id: "vitest-0001" }, data: { title: "no-audit" } })),
    ).rejects.toThrow(/audit entry/);
    expect((await db.exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).title).toBe("vitest");
  });

  it("rejects UPDATE and DELETE at the database level", async () => {
    const row = await db.auditLog.create({ data: { actorOid: "x", actorUsername: "x", action: "vitest.probe", entityType: "X", entityId: "1" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe("maker-checker", () => {
  it("request -> approve by a different user, both audited", async () => {
    const a = await mutate(analyst1, (ctx) => requestApproval(ctx, { ...ENTITY, comment: "please" }));
    expect(a.status).toBe("PENDING");
    const d = await mutate(approver1, (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "APPROVED", comment: "ok", requiredPermission: "example:approve" }));
    expect(d).toMatchObject({ status: "APPROVED", deciderOid: approver1.oid, decisionComment: "ok" });
    const actions = (await db.auditLog.findMany({ where: { entityType: "Approval", entityId: a.id } })).map((r) => r.action).sort();
    expect(actions).toEqual(["approval.approved", "approval.requested"]);
  });

  it("rejections are audited", async () => {
    const a = await mutate(analyst1, (ctx) => requestApproval(ctx, ENTITY));
    await mutate(approver1, (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "REJECTED", requiredPermission: "example:approve" }));
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "approval.rejected" } })).toBe(1);
  });

  it("the requester can never approve their own item (service layer)", async () => {
    // Give the requester the approve permission too, to prove the rule is not just RBAC.
    const both = buildUser({ ...approver1, roles: ["kyc_approver", "kyc_analyst"] });
    const a = await mutate(both, (ctx) => requestApproval(ctx, ENTITY));
    await expect(
      mutate(both, (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "APPROVED", requiredPermission: "example:approve" })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("the requester can never approve their own item (DB CHECK constraint)", async () => {
    const a = await mutate(analyst1, (ctx) => requestApproval(ctx, ENTITY));
    await expect(
      db.approval.update({ where: { id: a.id }, data: { status: "APPROVED", deciderOid: analyst1.oid, deciderUsername: "x", decidedAt: new Date() } }),
    ).rejects.toThrow(/approval_decider_not_requester/);
  });

  it("requires the approve permission, a pending status, and one pending request per entity", async () => {
    const a = await mutate(analyst1, (ctx) => requestApproval(ctx, ENTITY));
    await expect(mutate(analyst1, (ctx) => requestApproval(ctx, ENTITY))).rejects.toThrow(ConflictError);
    await expect(
      mutate(u("flags.admin1"), (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "APPROVED", requiredPermission: "example:approve" })),
    ).rejects.toThrow(ForbiddenError);
    await mutate(approver1, (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "APPROVED", requiredPermission: "example:approve" }));
    await expect(
      mutate(u("kyc.approver2"), (ctx) => decideApproval(ctx, { approvalId: a.id, decision: "REJECTED", requiredPermission: "example:approve" })),
    ).rejects.toThrow(ConflictError);
  });
});

describe("scopedDb", () => {
  it("scopes lists and turns out-of-scope detail/update into NotFoundError", async () => {
    const other = u("kyc.analyst2");
    expect((await scopedDb(other).exampleRequest.findMany()).map((r) => r.id)).not.toContain("vitest-0001");
    await expect(scopedDb(other).exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).rejects.toThrow(NotFoundError);
    expect(await scopedDb(other).exampleRequest.findUnique({ where: { id: "vitest-0001" } })).toBeNull();
    await expect(scopedDb(other).exampleRequest.update({ where: { id: "vitest-0001" }, data: { title: "x" } })).rejects.toThrow(NotFoundError);
    expect((await scopedDb(approver1).exampleRequest.findMany()).map((r) => r.id)).toContain("vitest-0001");
  });

  it("masks PII in results unless pii:read", async () => {
    expect((await scopedDb(analyst1).exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).idNumber).toBe(`${MASK}7777`);
    expect((await scopedDb(refundsApprover).exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).idNumber).toBe(`${MASK}7777`);
    expect((await scopedDb(approver1).exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } })).idNumber).toBe("TEST-0000-7777");
  });

  it("refuses to write a masked value back into a PII field", async () => {
    const masked = await scopedDb(analyst1).exampleRequest.findUniqueOrThrow({ where: { id: "vitest-0001" } });
    await expect(
      scopedDb(analyst1).exampleRequest.update({ where: { id: masked.id }, data: { idNumber: masked.idNumber } }),
    ).rejects.toThrow(/masked PII/);
    await expect(
      scopedDb(analyst1).exampleRequest.update({ where: { id: masked.id }, data: { idNumber: { set: masked.idNumber } } }),
    ).rejects.toThrow(/masked PII/);
  });

  it("refuses groupBy/aggregate over PII fields without pii:read", async () => {
    await expect(scopedDb(analyst1).exampleRequest.groupBy({ by: ["idNumber"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(scopedDb(analyst1).exampleRequest.aggregate({ _max: { dateOfBirth: true } })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await scopedDb(analyst1).exampleRequest.aggregate({ _sum: { amountCents: true } })).toBeTruthy();
    expect((await scopedDb(approver1).exampleRequest.groupBy({ by: ["idNumber"] })).length).toBeGreaterThan(0);
  });

  it("hides the audit log from users without audit:read", async () => {
    expect(await scopedDb(analyst1).auditLog.count()).toBe(0);
    expect(await scopedDb(u("auditor1")).auditLog.count()).toBeGreaterThan(0);
  });
});
