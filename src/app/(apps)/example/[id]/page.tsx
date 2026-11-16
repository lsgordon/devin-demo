import { hasPermission, requirePermission } from "@/platform/authz";
import { getRequest } from "@/apps/example/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { ApprovalHistory, Fields, PageHeader, StatusBadge } from "@/platform/ui/components";
import { decideAction, submitAction } from "../actions";

export default async function ExampleDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("example:read");
  const { id } = await params;
  const { request, approvals } = await notFoundOnMissing(getRequest(user, id));
  const pending = approvals.find((a) => a.status === "PENDING");
  return (
    <>
      <PageHeader
        back={{ href: "/example", label: "Example requests" }}
        title={request.title}
        badges={<StatusBadge status={request.status} testId="status" />}
      />
      <div className="grid-2">
        <div className="card">
          <h2>Details</h2>
          <Fields
            testId="example-detail"
            items={[
              ["Customer", request.customerName],
              ["Date of birth", <span key="dob" className="mono" data-testid="dob">{request.dateOfBirth}</span>],
              ["ID number", <span key="idn" className="mono" data-testid="id-number">{request.idNumber}</span>],
              ["Amount", `$${(request.amountCents / 100).toFixed(2)}`],
            ]}
          />
        </div>
        <div className="stack">
          {hasPermission(user, "example:write") && (request.status === "DRAFT" || request.status === "REJECTED") && (
            <form action={submitAction} className="card">
              <h2>Submit for approval</h2>
              <input type="hidden" name="id" value={request.id} />
              <div className="inline-form">
                <input name="comment" placeholder="Comment for approver" aria-label="Comment for approver" />
                <button className="primary" type="submit" data-testid="submit-for-approval">Submit</button>
              </div>
            </form>
          )}

          {pending && hasPermission(user, "example:approve") && (
            <form action={decideAction} className="card">
              <h2>Your decision</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                Requested by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}
              </p>
              <input type="hidden" name="approvalId" value={pending.id} />
              <div className="stack" style={{ gap: ".6rem" }}>
                <input name="comment" placeholder="Decision comment" aria-label="Decision comment" />
                <div className="form-actions" style={{ marginTop: 0 }}>
                  <button className="primary" name="decision" value="APPROVED" data-testid="approve">Approve</button>
                  <button className="danger" name="decision" value="REJECTED" data-testid="reject">Reject</button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <ApprovalHistory approvals={approvals} />
    </>
  );
}
