import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { getChangeRequest } from "@/apps/flags/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { decideChangeRequestAction } from "../../actions";

const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "on" : "off") : String(v));

export default async function ChangeRequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("flags:read");
  const { id } = await params;
  const { error } = await searchParams;
  const { changeRequest: cr, current, approvals, diff } = await notFoundOnMissing(getChangeRequest(user, id));
  const pendingApproval = approvals.find((a) => a.status === "PENDING");
  const isOwn = cr.requesterOid === user.oid;
  return (
    <>
      <p><Link href={current ? `/flags/${current.id}` : "/flags"}>← {current ? "Flag" : "All flags"}</Link></p>
      <h1>{cr.kind === "CREATE" ? "Create" : "Change"} {cr.key} <span className="badge">{cr.environment}</span></h1>
      {error && <p className="card" role="alert" data-testid="error">{error}</p>}
      <p>Status: <strong data-testid="cr-status">{cr.status}</strong></p>

      <table data-testid="diff">
        <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
        <tbody>
          {Object.entries(diff).map(([field, d]) => (
            <tr key={field} data-testid={`diff-${field}`}>
              <td>{field}</td>
              <td>{show(d?.from)}</td>
              <td><strong>{show(d?.to)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      {cr.status === "PENDING" && pendingApproval && hasPermission(user, "flags:approve") && (
        isOwn ? (
          <p className="card muted" data-testid="own-request">You requested this change; a different flags admin must approve it.</p>
        ) : (
          <form action={decideChangeRequestAction} className="card">
            <p>Requested by {pendingApproval.requesterUsername}{pendingApproval.requestComment ? `: “${pendingApproval.requestComment}”` : ""}</p>
            <input type="hidden" name="changeRequestId" value={cr.id} />
            <input name="comment" placeholder="Decision comment" aria-label="Decision comment" />{" "}
            <button className="primary" name="decision" value="APPROVED" data-testid="approve">Approve</button>{" "}
            <button className="danger" name="decision" value="REJECTED" data-testid="reject">Reject</button>
          </form>
        )
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
