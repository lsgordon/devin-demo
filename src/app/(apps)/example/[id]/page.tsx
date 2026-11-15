import { hasPermission, requirePermission } from "@/platform/authz";
import { getRequest } from "@/apps/example/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { decideAction, submitAction } from "../actions";

export default async function ExampleDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("example:read");
  const { id } = await params;
  const { request, approvals } = await notFoundOnMissing(getRequest(user, id));
  const pending = approvals.find((a) => a.status === "PENDING");
  return (
    <>
      <h1>{request.title}</h1>
      <div className="card" data-testid="example-detail">
        <p>Customer: {request.customerName}</p>
        <p>DOB: <span data-testid="dob">{request.dateOfBirth}</span></p>
        <p>ID number: <span data-testid="id-number">{request.idNumber}</span></p>
        <p>Amount: ${(request.amountCents / 100).toFixed(2)}</p>
        <p>Status: <strong data-testid="status">{request.status}</strong></p>
      </div>

      {hasPermission(user, "example:write") && (request.status === "DRAFT" || request.status === "REJECTED") && (
        <form action={submitAction} className="card">
          <input type="hidden" name="id" value={request.id} />
          <input name="comment" placeholder="Comment for approver" />{" "}
          <button className="primary" type="submit" data-testid="submit-for-approval">Submit for approval</button>
        </form>
      )}

      {pending && hasPermission(user, "example:approve") && (
        <form action={decideAction} className="card">
          <p>Requested by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}</p>
          <input type="hidden" name="approvalId" value={pending.id} />
          <input name="comment" placeholder="Decision comment" />{" "}
          <button className="primary" name="decision" value="APPROVED" data-testid="approve">Approve</button>{" "}
          <button className="danger" name="decision" value="REJECTED" data-testid="reject">Reject</button>
        </form>
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
        </tbody>
      </table>
    </>
  );
}
