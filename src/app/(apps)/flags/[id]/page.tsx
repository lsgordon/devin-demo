import Link from "next/link";
import { hasPermission, requirePermission } from "@/platform/authz";
import { getFlag, requiresApproval } from "@/apps/flags/service";
import { notFoundOnMissing } from "@/platform/ui/errors";
import { updateFlagAction } from "../actions";

export default async function FlagDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("flags:read");
  const { id } = await params;
  const { error } = await searchParams;
  const { flag, changeRequests, pending } = await notFoundOnMissing(getFlag(user, id));
  const needsApproval = requiresApproval(flag.environment);
  return (
    <>
      <p><Link href="/flags">← All flags</Link></p>
      <h1>{flag.key} <span className="badge" data-testid="environment">{flag.environment}</span></h1>
      {error && <p className="card" role="alert" data-testid="error">{error}</p>}
      <div className="card" data-testid="flag-detail">
        <p>Description: <span data-testid="description">{flag.description}</span></p>
        <p>Enabled: <strong data-testid="enabled">{flag.enabled ? "on" : "off"}</strong></p>
        <p>Rollout: <strong data-testid="rollout">{flag.rolloutPercent}%</strong></p>
        <p className="muted">Updated {flag.updatedAt.toISOString()}</p>
      </div>

      {pending && (
        <p className="card" data-testid="pending-banner">
          A change is pending approval: <Link href={`/flags/requests/${pending.id}`}>{pending.id}</Link>
        </p>
      )}

      {hasPermission(user, "flags:write") && !pending && (
        <form action={updateFlagAction} className="card" data-testid="edit-flag">
          <h3>{needsApproval ? "Request a change (needs approval by another flags admin)" : "Edit"}</h3>
          <input type="hidden" name="id" value={flag.id} />
          <p><input name="description" defaultValue={flag.description} required aria-label="Description" /></p>
          <p>
            <label><input type="checkbox" name="enabled" defaultChecked={flag.enabled} data-testid="edit-enabled" /> Enabled</label>{" "}
            <label>Rollout % <input type="number" name="rolloutPercent" min={0} max={100} defaultValue={flag.rolloutPercent} aria-label="Rollout percent" data-testid="edit-rollout" /></label>
          </p>
          {needsApproval && <p><input name="comment" placeholder="Comment for approver" aria-label="Comment" /></p>}
          <button className="primary" type="submit" data-testid="edit-submit">{needsApproval ? "Request approval" : "Save"}</button>
        </form>
      )}

      {needsApproval && (
        <>
          <h3>Change requests</h3>
          <table data-testid="change-requests">
            <thead><tr><th>Request</th><th>Kind</th><th>Status</th><th>Requested</th></tr></thead>
            <tbody>
              {changeRequests.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/flags/requests/${c.id}`}>{c.id}</Link></td>
                  <td>{c.kind}</td>
                  <td>{c.status}</td>
                  <td>{c.createdAt.toISOString()}</td>
                </tr>
              ))}
              {changeRequests.length === 0 && <tr><td colSpan={4} className="muted">None.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
