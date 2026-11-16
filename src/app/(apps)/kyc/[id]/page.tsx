import { hasPermission, requirePermission } from "@/platform/authz";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { ApprovalHistory, Avatar, Fields, PageHeader, StatusBadge } from "@/platform/ui/components";
import { formatDateTime, humanize } from "@/platform/ui/format";
import { analystLabel, KYC_ANALYSTS } from "@/apps/kyc/analysts";
import { RiskBadge } from "@/apps/kyc/ui";
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
      <PageHeader
        back={{ href: "/kyc", label: "KYC cases" }}
        title={c.customerName}
        badges={<StatusBadge status={c.status} testId="status" />}
        subtitle={<>Case <span className="mono">{c.id.toUpperCase()}</span> · opened {formatDateTime(c.createdAt)}</>}
      />

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h2>Customer details</h2>
            <Fields
              testId="kyc-detail"
              items={[
                ["Customer", c.customerName],
                ["Date of birth", <span key="dob" className="mono" data-testid="dob">{c.dateOfBirth}</span>],
                ["National ID", <span key="nid" className="mono" data-testid="national-id">{c.nationalId}</span>],
                ["Document type", humanize(c.documentType)],
                ["Risk score", <RiskBadge key="risk" score={c.riskScore} />],
                ["Assignee", <span key="assignee" data-testid="assignee">{analystLabel(c.assigneeOid)}</span>],
              ]}
            />
          </div>

          {c.recommendation && (
            <div className="card">
              <h2>Analyst recommendation</h2>
              <p style={{ margin: 0 }}>
                <StatusBadge status={c.recommendation} label={`Recommend ${c.recommendation.toLowerCase()}`} testId="recommendation" />{" "}
                <span className="muted">by {analystLabel(c.recommendedByOid)}</span>
              </p>
              {c.recommendationReason && <p style={{ marginBottom: 0 }}>“{c.recommendationReason}”</p>}
            </div>
          )}

          <div className="card">
            <h2>Notes</h2>
            <ul className="timeline" data-testid="notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <Avatar name={n.authorUsername} />
                  <div>
                    <div className="meta"><strong style={{ color: "var(--fg)" }}>{n.authorUsername}</strong> · {formatDateTime(n.createdAt)}</div>
                    <div className="body">{n.body}</div>
                  </div>
                </li>
              ))}
              {notes.length === 0 && <li className="muted" style={{ display: "block" }}>No notes yet.</li>}
            </ul>
            {canWrite && (
              <form action={addNoteAction} style={{ marginTop: "1rem" }}>
                <input type="hidden" name="caseId" value={c.id} />
                <textarea name="body" required maxLength={2000} rows={3} placeholder="Add a note for the case file…" data-testid="note-body" />
                <div className="form-actions" style={{ marginTop: ".5rem" }}>
                  <button type="submit" data-testid="add-note">Add note</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="stack">
          {canWrite && c.status === "SUBMITTED" && (
            <form action={recommendAction} className="card">
              <h2>Your recommendation</h2>
              <p className="muted small" style={{ marginTop: 0 }}>A KYC approver will make the final decision.</p>
              <input type="hidden" name="caseId" value={c.id} />
              <div className="stack" style={{ gap: ".6rem" }}>
                <select name="recommendation" defaultValue="APPROVE" aria-label="Recommendation" data-testid="recommendation-select">
                  <option value="APPROVE">Recommend approve</option>
                  <option value="REJECT">Recommend reject</option>
                </select>
                <input name="reason" placeholder="Reason" aria-label="Reason" />
                <button className="primary" type="submit" data-testid="recommend">Send for approval</button>
              </div>
            </form>
          )}

          {canApprove && pending && !ownRecommendation && (
            <form action={decideAction} className="card">
              <h2>Final decision</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                Recommended by {pending.requesterUsername}{pending.requestComment ? `: “${pending.requestComment}”` : ""}
              </p>
              <input type="hidden" name="caseId" value={c.id} />
              <div className="stack" style={{ gap: ".6rem" }}>
                <input name="comment" placeholder="Decision comment" aria-label="Decision comment" />
                <div className="form-actions" style={{ marginTop: 0 }}>
                  <button className="primary" name="decision" value="APPROVE" data-testid="approve">Approve case</button>
                  <button className="danger" name="decision" value="REJECT" data-testid="reject">Reject case</button>
                </div>
              </div>
            </form>
          )}
          {canApprove && pending && ownRecommendation && (
            <p className="notice" data-testid="own-recommendation">You recommended this case, so another approver must decide it.</p>
          )}

          {canApprove && !isFinal && (
            <form action={reassignAction} className="card">
              <h2>Assignment</h2>
              <input type="hidden" name="caseId" value={c.id} />
              <div className="inline-form">
                <select name="assigneeOid" defaultValue={c.assigneeOid ?? ""} aria-label="Assignee" data-testid="assignee-select" style={{ flex: 1 }}>
                  <option value="" disabled>Choose analyst</option>
                  {KYC_ANALYSTS.map((a) => <option key={a.oid} value={a.oid}>{a.name} ({a.username})</option>)}
                </select>
                <button type="submit" data-testid="reassign">Reassign</button>
              </div>
            </form>
          )}

          {isFinal && (
            <p className={`notice ${c.status === "APPROVED" ? "info" : ""}`}>This case is closed: {humanize(c.status).toLowerCase()}.</p>
          )}
        </div>
      </div>

      <ApprovalHistory approvals={approvals} />
    </>
  );
}
