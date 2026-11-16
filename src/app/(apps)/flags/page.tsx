import Link from "next/link";
import type { FlagEnvironment } from "@prisma/client";
import { hasPermission, requirePermission } from "@/platform/authz";
import { PageHeader } from "@/platform/ui/components";
import { formatDateTime } from "@/platform/ui/format";
import { ENVIRONMENTS, listFlags, listPendingChangeRequests } from "@/apps/flags/service";
import { CHANGE_KIND_LABEL, EnabledBadge, EnvBadge, Rollout } from "@/apps/flags/ui";
import { createFlagAction } from "./actions";

type Search = { environment?: string; error?: string };

export default async function FlagsList({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("flags:read");
  const sp = await searchParams;
  const environment = (ENVIRONMENTS as readonly string[]).includes(sp.environment ?? "") ? (sp.environment as FlagEnvironment) : undefined;
  const [flags, pending] = await Promise.all([listFlags(user, environment), listPendingChangeRequests(user)]);
  const canWrite = hasPermission(user, "flags:write");
  return (
    <>
      <PageHeader title="Feature flags" subtitle="Dev and staging changes apply immediately. Production changes need approval by a second flags admin." />
      {sp.error && <p className="alert" role="alert" data-testid="error">{sp.error}</p>}

      {pending.length > 0 && (
        <div className="section" style={{ marginTop: 0, marginBottom: "2rem" }}>
          <div className="section-title"><h2>Pending production changes</h2><span className="badge">{pending.length}</span></div>
          <div className="table-wrap">
            <table data-testid="pending-requests">
              <thead><tr><th>Flag</th><th>Type</th><th>Requested</th><th /></tr></thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id} data-testid={`pending-${c.key}`}>
                    <td><span className="mono">{c.key}</span> <EnvBadge env={c.environment} /></td>
                    <td>{CHANGE_KIND_LABEL[c.kind] ?? c.kind}</td>
                    <td className="muted">{formatDateTime(c.createdAt)}</td>
                    <td className="num"><Link href={`/flags/requests/${c.id}`}>Review →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <form className="filters" method="get">
        <select name="environment" defaultValue={environment ?? ""} aria-label="Environment">
          <option value="">All environments</option>
          {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <button type="submit">Filter</button>
      </form>

      <div className="table-wrap">
        <table data-testid="flags-list">
          <thead><tr><th>Flag</th><th>Environment</th><th>Status</th><th>Rollout</th><th>Description</th></tr></thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id} data-testid={`flag-${f.key}-${f.environment}`}>
                <td><Link href={`/flags/${f.id}`} className="mono">{f.key}</Link></td>
                <td><EnvBadge env={f.environment} /></td>
                <td><EnabledBadge enabled={f.enabled} /></td>
                <td><Rollout percent={f.rolloutPercent} /></td>
                <td className="muted">{f.description}</td>
              </tr>
            ))}
            {flags.length === 0 && <tr><td colSpan={5} className="empty">No flags yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <form action={createFlagAction} className="card section" data-testid="create-flag">
          <h2>New flag</h2>
          <div className="form-grid">
            <label className="field">Key <input name="key" placeholder="e.g. new-checkout" required aria-label="Key" /></label>
            <label className="field">Description <input name="description" placeholder="What does this flag do?" required aria-label="Description" /></label>
            <label className="field">
              Environment
              <select name="environment" defaultValue="dev" aria-label="Environment">
                {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label className="field">Rollout % <input type="number" name="rolloutPercent" min={0} max={100} defaultValue={0} aria-label="Rollout percent" /></label>
            <label className="field">Comment for approver <input name="comment" placeholder="Production only" aria-label="Comment" /></label>
          </div>
          <div className="form-actions">
            <label className="check"><input type="checkbox" name="enabled" /> Enabled</label>
            <span style={{ flex: 1 }} />
            <span className="muted small">Production flags are created after approval.</span>
            <button className="primary" type="submit" data-testid="create-flag-submit">Create flag</button>
          </div>
        </form>
      )}
    </>
  );
}
