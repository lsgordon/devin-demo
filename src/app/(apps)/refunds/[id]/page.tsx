import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { formatCents, getRefund } from "@/apps/refunds/service";
import { decideRefundAction } from "../actions";

export default async function RefundDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("refunds:read");
  const { id } = await params;
  const { refund, approvals } = await notFoundOnMissing(getRefund(user, id));
  const pending = approvals.find((a) => a.status === "PENDING");
  const canDecide =
    !!pending && refund.status === "PENDING_APPROVAL" && hasPermission(user, "refunds:approve") &&
    pending.requesterOid !== user.oid && refund.createdByOid !== user.oid;
  return (
    <>
      <p><Link href="/refunds">← Refund requests</Link></p>
      <h1>Refund {refund.orderId}</h1>
      <div className="card" data-testid="refund-detail">
        <p>Id: {refund.id}</p>
        <p>Customer email: <span data-testid="customer-email">{refund.customerEmail}</span></p>
        <p>Card last 4: <span data-testid="card-last4">{refund.cardLast4}</span></p>
        <p>Amount: <span data-testid="amount">{formatCents(refund.amountCents)}</span></p>
        <p>Reason: {refund.reason}{refund.note ? ` — ${refund.note}` : ""}</p>
        <p>
          Status: <strong data-testid="status">{refund.status}</strong>
          {refund.autoApproved && <> <span className="badge" data-testid="auto-approved">auto-approved</span></>}
        </p>
        <p>Created by {refund.createdByUsername} at {refund.createdAt.toISOString()}</p>
        {refund.decidedByUsername && <p>Decided by {refund.decidedByUsername}</p>}
        {hasPermission(user, "audit:read") && (
          <p><Link href={`/audit?entityType=RefundRequest&entityId=${refund.id}`}>Audit trail</Link></p>
        )}
      </div>

      {canDecide && (
        <div className="card" data-testid="decision-form">
          <p>Requested by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}</p>
          {/* One form per decision: the decision is a hidden field, so it is sent even before hydration. */}
          {(["APPROVED", "REJECTED"] as const).map((decision) => (
            <form key={decision} action={decideRefundAction} style={{ display: "inline-flex", gap: ".5rem", marginRight: "1rem" }}>
              <input type="hidden" name="id" value={refund.id} />
              <input type="hidden" name="decision" value={decision} />
              <input name="comment" placeholder={decision === "APPROVED" ? "Approval comment" : "Rejection reason"} aria-label={`${decision} comment`} />
              {decision === "APPROVED"
                ? <button className="primary" type="submit" data-testid="approve">Approve</button>
                : <button className="danger" type="submit" data-testid="reject">Reject</button>}
            </form>
          ))}
        </div>
      )}

      <h3>Approval history</h3>
      <table data-testid="approvals">
        <thead><tr><th>Status</th><th>Requester</th><th>Decider</th><th>Comment</th></tr></thead>
        <tbody>
          {approvals.map((a) => (
            <tr key={a.id}>
              <td>{a.status}</td>
              <td>{a.requesterUsername}</td>
              <td>{a.deciderUsername ?? "—"}</td>
              <td>{a.decisionComment ?? a.requestComment ?? ""}</td>
            </tr>
          ))}
          {approvals.length === 0 && <tr><td colSpan={4} className="muted">{refund.autoApproved ? "Auto-approved (≤ $100), no approval needed." : "None."}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
