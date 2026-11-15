import { hasPermission, requirePermission } from "@/platform/authz";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { analystLabel, KYC_ANALYSTS } from "@/apps/kyc/analysts";
import { getCase } from "@/apps/kyc/service";
import { addNoteAction, decideAction, reassignAction, recommendAction } from "../actions";

export default async function KycDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("kyc:read");
  const { id } = await params;
  const { case: c, notes, approvals } = await notFoundOnMissing(getCase(user, id));
  const isFinal = c.status === "APPROVED" || c.status === "REJECTED";
  const canWrite = hasPermission(user, "kyc:write") && c.assigneeOid === user.oid;
  const canApprove = hasPermission(user, "kyc:approve");
  const pending = approvals.find((a) => a.status === "PENDING");
  const ownRecommendation = c.recommendedByOid === user.oid;

  return (
    <>
      <h1>KYC case {c.id}</h1>
      <div className="card" data-testid="kyc-detail">
        <p>Customer: {c.customerName}</p>
        <p>DOB: <span data-testid="dob">{c.dateOfBirth}</span></p>
        <p>National ID: <span data-testid="national-id">{c.nationalId}</span></p>
        <p>Document type: {c.documentType}</p>
        <p>Risk score: {c.riskScore}</p>
        <p>Assignee: <span data-testid="assignee">{analystLabel(c.assigneeOid)}</span></p>
        <p>Status: <strong data-testid="status">{c.status}</strong></p>
        {c.recommendation && (
          <p>Recommendation: <span data-testid="recommendation">{c.recommendation}</span> by {analystLabel(c.recommendedByOid)}
            {c.recommendationReason ? ` (“${c.recommendationReason}”)` : ""}</p>
        )}
      </div>

      {canWrite && c.status === "SUBMITTED" && (
        <form action={recommendAction} className="card">
          <input type="hidden" name="caseId" value={c.id} />
          <select name="recommendation" defaultValue="APPROVE" aria-label="Recommendation" data-testid="recommendation-select">
            <option value="APPROVE">Recommend approve</option>
            <option value="REJECT">Recommend reject</option>
          </select>{" "}
          <input name="reason" placeholder="Reason" />{" "}
          <button className="primary" type="submit" data-testid="recommend">Send for approval</button>
        </form>
      )}

      {canApprove && pending && !ownRecommendation && (
        <form action={decideAction} className="card">
          <p>Recommended by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}</p>
          <input type="hidden" name="caseId" value={c.id} />
          <input name="comment" placeholder="Decision comment" />{" "}
          <button className="primary" name="decision" value="APPROVE" data-testid="approve">Approve case</button>{" "}
          <button className="danger" name="decision" value="REJECT" data-testid="reject">Reject case</button>
        </form>
      )}
      {canApprove && pending && ownRecommendation && (
        <p className="card muted" data-testid="own-recommendation">You recommended this case, so another approver must decide it.</p>
      )}

      {canApprove && !isFinal && (
        <form action={reassignAction} className="card">
          <input type="hidden" name="caseId" value={c.id} />
          <select name="assigneeOid" defaultValue={c.assigneeOid ?? ""} aria-label="Assignee" data-testid="assignee-select">
            <option value="" disabled>Choose analyst</option>
            {KYC_ANALYSTS.map((a) => <option key={a.oid} value={a.oid}>{a.username}</option>)}
          </select>{" "}
          <button type="submit" data-testid="reassign">Reassign</button>
        </form>
      )}

      <h3>Notes</h3>
      <ul data-testid="notes">
        {notes.map((n) => (
          <li key={n.id}><span className="muted">{n.createdAt.toISOString()} {n.authorUsername}:</span> {n.body}</li>
        ))}
        {notes.length === 0 && <li className="muted">No notes.</li>}
      </ul>
      {canWrite && (
        <form action={addNoteAction} className="card">
          <input type="hidden" name="caseId" value={c.id} />
          <textarea name="body" required maxLength={2000} rows={2} cols={60} placeholder="Add a note" data-testid="note-body" />{" "}
          <button type="submit" data-testid="add-note">Add note</button>
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
