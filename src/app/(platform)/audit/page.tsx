import { requirePermission } from "@/platform/authz";
import { auditEntityTypes, queryAudit } from "@/platform/audit/query";

type Search = { entityType?: string; entityId?: string; actor?: string; action?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("audit:read");
  const f = await searchParams;
  const [rows, types] = await Promise.all([queryAudit(user, f), auditEntityTypes()]);
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Append-only. Newest first, max 200 rows.</p>
      <form className="filters" method="get" data-testid="audit-filters">
        <select name="entityType" defaultValue={f.entityType ?? ""} aria-label="Entity type">
          <option value="">All entity types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input name="entityId" placeholder="Entity id" defaultValue={f.entityId ?? ""} />
        <input name="actor" placeholder="Actor (oid or username)" defaultValue={f.actor ?? ""} />
        <input name="action" placeholder="Action contains" defaultValue={f.action ?? ""} />
        <button type="submit">Filter</button>
      </form>
      <table data-testid="audit-table">
        <thead>
          <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Before</th><th>After</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt.toISOString()}</td>
              <td>{r.actorUsername}<br /><span className="muted">{r.actorOid}</span></td>
              <td>{r.action}</td>
              <td>{r.entityType}<br /><span className="muted">{r.entityId}</span></td>
              <td><pre>{r.before ? JSON.stringify(r.before, null, 1) : "—"}</pre></td>
              <td><pre>{r.after ? JSON.stringify(r.after, null, 1) : "—"}</pre></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No entries.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
