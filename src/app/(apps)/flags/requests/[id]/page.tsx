import { hasPermission, requirePermission } from "@/platform/authz";
import { getChangeRequest } from "@/apps/flags/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { ApprovalHistory, PageHeader, StatusBadge } from "@/platform/ui/components";
import { formatDateTime } from "@/platform/ui/format";
import { EnvBadge } from "@/apps/flags/ui";
import { decideChangeRequestAction } from "../../actions";

const FIELD_LABEL: Record<string, string> = { description: "Description", enabled: "Enabled", rolloutPercent: "Rollout" };
const show = (field: string, v: unknown) =>
  v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "On" : "Off") : field === "rolloutPercent" ? `${v}%` : String(v);

export default async function ChangeRequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("flags:read");
  const { id } = await params;
  const { error } = await searchParams;
  const { changeRequest: cr, current, approvals, diff } = await notFoundOnMissing(getChangeRequest(user, id));
  const pendingApproval = approvals.find((a) => a.status === "PENDING");
  const isOwn = cr.requesterOid === user.oid;
  return (
    <>
      <PageHeader
        back={current ? { href: `/flags/${current.id}`, label: current.key } : { href: "/flags", label: "Feature flags" }}
        title={<>{cr.kind === "CREATE" ? "New flag" : "Change to"} <span className="mono">{cr.key}</span></>}
        badges={<><EnvBadge env={cr.environment} /><StatusBadge status={cr.status} testId="cr-status" /></>}
        subtitle={`Requested ${formatDateTime(cr.createdAt)}`}
      />
      {error && <p className="alert" role="alert" data-testid="error">{error}</p>}

      <div className="grid-2">
        <div className="table-wrap">
          <table data-testid="diff">
            <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
            <tbody>
              {Object.entries(diff).map(([field, d]) => (
                <tr key={field} data-testid={`diff-${field}`}>
                  <td className="muted">{FIELD_LABEL[field] ?? field}</td>
                  <td>{show(field, d?.from)}</td>
                  <td><strong>{show(field, d?.to)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stack">
          {cr.status === "PENDING" && pendingApproval && hasPermission(user, "flags:approve") && (
            isOwn ? (
              <p className="notice" data-testid="own-request" style={{ margin: 0 }}>You requested this change; a different flags admin must approve it.</p>
            ) : (
              <form action={decideChangeRequestAction} className="card">
                <h2>Your decision</h2>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Requested by {pendingApproval.requesterUsername}{pendingApproval.requestComment ? `: “${pendingApproval.requestComment}”` : ""}
                </p>
                <input type="hidden" name="changeRequestId" value={cr.id} />
                <div className="stack" style={{ gap: ".6rem" }}>
                  <input name="comment" placeholder="Decision comment" aria-label="Decision comment" />
                  <div className="form-actions" style={{ marginTop: 0 }}>
                    <button className="primary" name="decision" value="APPROVED" data-testid="approve">Approve</button>
                    <button className="danger" name="decision" value="REJECTED" data-testid="reject">Reject</button>
                  </div>
                </div>
              </form>
            )
          )}
        </div>
      </div>

      <ApprovalHistory approvals={approvals} />
    </>
  );
}
