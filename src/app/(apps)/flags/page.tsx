import Link from "next/link";
import type { FlagEnvironment } from "@prisma/client";
import { hasPermission, requirePermission } from "@/platform/authz";
import { ENVIRONMENTS, listFlags, listPendingChangeRequests } from "@/apps/flags/service";
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
      <h1>Feature flags</h1>
      <p className="muted">dev and staging changes apply immediately. prod changes need approval by a different flags admin.</p>
      {sp.error && <p className="card" role="alert" data-testid="error">{sp.error}</p>}

      <form className="filters" method="get">
        <select name="environment" defaultValue={environment ?? ""} aria-label="Environment">
          <option value="">All environments</option>
          {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>{" "}
        <button type="submit">Filter</button>
      </form>

      <table data-testid="flags-list">
        <thead><tr><th>Key</th><th>Environment</th><th>Enabled</th><th>Rollout</th><th>Description</th></tr></thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id} data-testid={`flag-${f.key}-${f.environment}`}>
              <td><Link href={`/flags/${f.id}`}>{f.key}</Link></td>
              <td><span className="badge">{f.environment}</span></td>
              <td>{f.enabled ? "on" : "off"}</td>
              <td>{f.rolloutPercent}%</td>
              <td>{f.description}</td>
            </tr>
          ))}
          {flags.length === 0 && <tr><td colSpan={5} className="muted">No flags.</td></tr>}
        </tbody>
      </table>

      <h3>Pending prod changes</h3>
      <table data-testid="pending-requests">
        <thead><tr><th>Request</th><th>Kind</th><th>Key</th><th>Requested</th></tr></thead>
        <tbody>
          {pending.map((c) => (
            <tr key={c.id} data-testid={`pending-${c.key}`}>
              <td><Link href={`/flags/requests/${c.id}`}>{c.id}</Link></td>
              <td>{c.kind}</td>
              <td>{c.key}</td>
              <td>{c.createdAt.toISOString()}</td>
            </tr>
          ))}
          {pending.length === 0 && <tr><td colSpan={4} className="muted">None.</td></tr>}
        </tbody>
      </table>

      {canWrite && (
        <form action={createFlagAction} className="card" data-testid="create-flag">
          <h3>New flag</h3>
          <p><input name="key" placeholder="key (e.g. new-checkout)" required aria-label="Key" /></p>
          <p><input name="description" placeholder="Description" required aria-label="Description" /></p>
          <p>
            <select name="environment" defaultValue="dev" aria-label="Environment">
              {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>{" "}
            <label><input type="checkbox" name="enabled" /> Enabled</label>{" "}
            <label>Rollout % <input type="number" name="rolloutPercent" min={0} max={100} defaultValue={0} aria-label="Rollout percent" /></label>
          </p>
          <p><input name="comment" placeholder="Comment for approver (prod only)" aria-label="Comment" /></p>
          <button className="primary" type="submit" data-testid="create-flag-submit">Create (prod: request approval)</button>
        </form>
      )}
    </>
  );
}
