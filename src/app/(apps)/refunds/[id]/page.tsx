import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { ApprovalHistory, Fields, PageHeader, StatusBadge } from "@/platform/ui/components";
import { formatDateTime, humanize } from "@/platform/ui/format";
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
      <PageHeader
        back={{ href: "/refunds", label: "Refund requests" }}
        title={<>Refund for <span className="mono">{refund.orderId}</span></>}
        badges={<>
          <StatusBadge status={refund.status} testId="status" />
          {refund.autoApproved && <span className="badge" data-testid="auto-approved">Auto-approved</span>}
        </>}
        subtitle={`Request ${refund.id} · requested by ${refund.createdByUsername} · ${formatDateTime(refund.createdAt)}`}
        actions={hasPermission(user, "audit:read") && (
          <Link className="button" href={`/audit?entityType=RefundRequest&entityId=${refund.id}`}>View audit trail</Link>
        )}
      />

      <div className="grid-2">
        <div className="card">
          <h2>Request details</h2>
          <Fields
            testId="refund-detail"
            items={[
              ["Amount", <span key="amount" data-testid="amount" style={{ fontSize: "1.25rem" }}>{formatCents(refund.amountCents)}</span>],
              ["Reason", humanize(refund.reason)],
              ["Customer email", <span key="email" data-testid="customer-email">{refund.customerEmail}</span>],
              ["Card last 4", <span key="card" className="mono" data-testid="card-last4">{refund.cardLast4}</span>],
              ["Note", refund.note || <span key="note" className="muted">—</span>],
              ["Decided by", refund.decidedByUsername ?? (refund.autoApproved ? "Automatic" : <span key="dec" className="muted">Not decided yet</span>)],
            ]}
          />
        </div>

        <div className="stack">
          {canDecide && (
            <div className="card" data-testid="decision-form">
              <h2>Your decision</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                Requested by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}
              </p>
              {/* One form per decision: the decision is a hidden field, so it is sent even before hydration. */}
              <div className="stack" style={{ gap: ".6rem" }}>
                {(["APPROVED", "REJECTED"] as const).map((decision) => (
                  <form key={decision} action={decideRefundAction} className="inline-form">
                    <input type="hidden" name="id" value={refund.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <input name="comment" placeholder={decision === "APPROVED" ? "Approval comment (optional)" : "Rejection reason"} aria-label={`${decision} comment`} />
                    {decision === "APPROVED"
                      ? <button className="primary" type="submit" data-testid="approve" style={{ minWidth: 90 }}>Approve</button>
                      : <button className="danger" type="submit" data-testid="reject" style={{ minWidth: 90 }}>Reject</button>}
                  </form>
                ))}
              </div>
            </div>
          )}
          {!canDecide && refund.status === "PENDING_APPROVAL" && (
            <p className="notice">Waiting for a refunds approver other than the requester.</p>
          )}
          {refund.autoApproved && (
            <p className="notice info">Approved automatically because it is $100 or less.</p>
          )}
        </div>
      </div>

      <ApprovalHistory approvals={approvals} empty={refund.autoApproved ? "Auto-approved (≤ $100), no approval needed." : "No approval requests yet."} />
    </>
  );
}
