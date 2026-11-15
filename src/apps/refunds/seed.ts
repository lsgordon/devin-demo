import type { PrismaClient } from "@prisma/client";
import { persona } from "@/platform/auth/personas";

/** Obviously fake data. Idempotent (fixed ids + upsert). */
export default async function seed(db: PrismaClient) {
  const agent1 = persona("refunds.agent1");
  const agent2 = persona("refunds.agent2");
  const approver1 = persona("refunds.approver1");
  const at = (iso: string) => new Date(iso);
  const by = (p: { oid: string; preferred_username: string }) => ({ createdByOid: p.oid, createdByUsername: p.preferred_username });
  const decided = (p: { oid: string; preferred_username: string }, iso: string) => ({
    decidedByOid: p.oid,
    decidedByUsername: p.preferred_username,
    decidedAt: at(iso),
  });

  const rows = [
    { id: "refund-0001", orderId: "ORD-TEST-0001", customerEmail: "testy.mctestface@example.com", cardLast4: "4242", amountCents: 1999, reason: "DAMAGED", status: "APPROVED", autoApproved: true, ...by(agent1), decidedAt: at("2026-11-01T10:00:00Z"), createdAt: at("2026-11-01T10:00:00Z") },
    { id: "refund-0002", orderId: "ORD-TEST-0002", customerEmail: "sample.oplaceholder@example.com", cardLast4: "5454", amountCents: 25000, reason: "NOT_RECEIVED", note: "Courier lost parcel", status: "PENDING_APPROVAL", autoApproved: false, ...by(agent1), createdAt: at("2026-11-02T10:00:00Z") },
    { id: "refund-0003", orderId: "ORD-TEST-0003", customerEmail: "fakey.mcfakeface@example.com", cardLast4: "3782", amountCents: 15000, reason: "DUPLICATE_CHARGE", status: "PENDING_APPROVAL", autoApproved: false, ...by(agent2), createdAt: at("2026-11-03T10:00:00Z") },
    { id: "refund-0004", orderId: "ORD-TEST-0004", customerEmail: "demo.mcdemoface@example.com", cardLast4: "6011", amountCents: 50000, reason: "WRONG_ITEM", status: "APPROVED", autoApproved: false, ...by(agent2), ...decided(approver1, "2026-11-04T12:00:00Z"), createdAt: at("2026-11-04T10:00:00Z") },
    { id: "refund-0005", orderId: "ORD-TEST-0005", customerEmail: "placeholder.person@example.com", cardLast4: "3056", amountCents: 120000, reason: "OTHER", note: "Goodwill request", status: "REJECTED", autoApproved: false, ...by(agent1), ...decided(approver1, "2026-11-05T12:00:00Z"), createdAt: at("2026-11-05T10:00:00Z") },
    { id: "refund-0006", orderId: "ORD-TEST-0006", customerEmail: "example.user@example.com", cardLast4: "6331", amountCents: 4500, reason: "DAMAGED", status: "APPROVED", autoApproved: true, ...by(agent2), decidedAt: at("2026-11-06T10:00:00Z"), createdAt: at("2026-11-06T10:00:00Z") },
  ] as const;
  for (const row of rows) {
    await db.refundRequest.upsert({ where: { id: row.id }, create: row, update: row });
  }

  const approvals = [
    { id: "refund-approval-0002", entityId: "refund-0002", status: "PENDING", requester: agent1, createdAt: at("2026-11-02T10:00:00Z") },
    { id: "refund-approval-0003", entityId: "refund-0003", status: "PENDING", requester: agent2, createdAt: at("2026-11-03T10:00:00Z") },
    { id: "refund-approval-0004", entityId: "refund-0004", status: "APPROVED", requester: agent2, decider: approver1, decidedAt: at("2026-11-04T12:00:00Z"), createdAt: at("2026-11-04T10:00:00Z") },
    { id: "refund-approval-0005", entityId: "refund-0005", status: "REJECTED", requester: agent1, decider: approver1, decidedAt: at("2026-11-05T12:00:00Z"), createdAt: at("2026-11-05T10:00:00Z") },
  ] as const;
  for (const a of approvals) {
    const data = {
      id: a.id,
      entityType: "RefundRequest",
      entityId: a.entityId,
      action: "refund_request.approve",
      status: a.status,
      requesterOid: a.requester.oid,
      requesterUsername: a.requester.preferred_username,
      deciderOid: "decider" in a ? a.decider.oid : null,
      deciderUsername: "decider" in a ? a.decider.preferred_username : null,
      decidedAt: "decidedAt" in a ? a.decidedAt : null,
      createdAt: a.createdAt,
    };
    await db.approval.upsert({ where: { id: a.id }, create: data, update: data });
  }
}
