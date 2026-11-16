import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { getFlag, requiresApproval } from "@/apps/flags/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { Fields, PageHeader, StatusBadge } from "@/platform/ui/components";
import { formatDateTime } from "@/platform/ui/format";
import { CHANGE_KIND_LABEL, EnabledBadge, EnvBadge, Rollout } from "@/apps/flags/ui";
import { updateFlagAction } from "../actions";

export default async function FlagDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("flags:read");
  const { id } = await params;
  const { error } = await searchParams;
  const { flag, changeRequests, pending } = await notFoundOnMissing(getFlag(user, id));
  const needsApproval = requiresApproval(flag.environment);
  return (
    <>
      <PageHeader
        back={{ href: "/flags", label: "Feature flags" }}
        title={<span className="mono" style={{ fontSize: "1.4rem" }}>{flag.key}</span>}
        badges={<EnvBadge env={flag.environment} testId="environment" />}
        subtitle={<span data-testid="description">{flag.description}</span>}
      />
      {error && <p className="alert" role="alert" data-testid="error">{error}</p>}

      <div className="grid-2">
        <div className="card">
          <h2>Current state</h2>
          <Fields
            testId="flag-detail"
            items={[
              ["Status", <EnabledBadge key="en" enabled={flag.enabled} testId="enabled" />],
              ["Rollout", <Rollout key="ro" percent={flag.rolloutPercent} testId="rollout" />],
              ["Environment", flag.environment],
              ["Last updated", formatDateTime(flag.updatedAt)],
            ]}
          />
        </div>

        <div className="stack">
          {pending && (
            <p className="notice" data-testid="pending-banner" style={{ margin: 0 }}>
              A change to this flag is waiting for approval. <Link href={`/flags/requests/${pending.id}`}>Review request →</Link>
            </p>
          )}

          {hasPermission(user, "flags:write") && !pending && (
            <form action={updateFlagAction} className="card" data-testid="edit-flag">
              <h2>{needsApproval ? "Request a change" : "Edit flag"}</h2>
              {needsApproval && <p className="muted small" style={{ marginTop: 0 }}>Production: another flags admin must approve before it applies.</p>}
              <input type="hidden" name="id" value={flag.id} />
              <div className="stack" style={{ gap: ".75rem" }}>
                <label className="field">Description <input name="description" defaultValue={flag.description} required aria-label="Description" /></label>
                <label className="field">Rollout % <input type="number" name="rolloutPercent" min={0} max={100} defaultValue={flag.rolloutPercent} aria-label="Rollout percent" data-testid="edit-rollout" /></label>
                <label className="check"><input type="checkbox" name="enabled" defaultChecked={flag.enabled} data-testid="edit-enabled" /> Enabled</label>
                {needsApproval && <label className="field">Comment for approver <input name="comment" placeholder="Why is this change needed?" aria-label="Comment" /></label>}
              </div>
              <div className="form-actions">
                <button className="primary" type="submit" data-testid="edit-submit">{needsApproval ? "Request approval" : "Save changes"}</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {needsApproval && (
        <div className="section">
          <div className="section-title"><h2>Change requests</h2></div>
          <div className="table-wrap">
            <table data-testid="change-requests">
              <thead><tr><th>Type</th><th>Status</th><th>Requested</th><th /></tr></thead>
              <tbody>
                {changeRequests.map((c) => (
                  <tr key={c.id}>
                    <td>{CHANGE_KIND_LABEL[c.kind] ?? c.kind}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="muted">{formatDateTime(c.createdAt)}</td>
                    <td className="num"><Link href={`/flags/requests/${c.id}`}>View →</Link></td>
                  </tr>
                ))}
                {changeRequests.length === 0 && <tr><td colSpan={4} className="empty">No change requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
