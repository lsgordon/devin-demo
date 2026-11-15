import Link from "next/link";
import { requirePermission } from "@/platform/authz";
import { auditEntityTypes, queryAudit } from "@/platform/audit/query";
import { PageHeader } from "@/platform/ui/components";
import { formatDateTime, humanize } from "@/platform/ui/format";

type Search = { entityType?: string; entityId?: string; actor?: string; action?: string };
type Json = Record<string, unknown> | null;

const IGNORED = new Set(["id", "updatedAt", "createdAt", "version"]);
const ENUM = /^[A-Z][A-Z0-9_]+$/;
const show = (v: unknown) =>
  v === null || v === undefined ? "—"
  : typeof v === "object" ? JSON.stringify(v)
  : typeof v === "boolean" ? (v ? "Yes" : "No")
  : typeof v === "string" && ENUM.test(v) ? humanize(v)
  : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDateTime(v)
  : String(v);

/** Fields whose value changed between the before/after snapshots (all set fields for creates). */
function changes(before: unknown, after: unknown): { key: string; from?: unknown; to: unknown }[] {
  const b = (before && typeof before === "object" ? before : null) as Json;
  const a = (after && typeof after === "object" ? after : null) as Json;
  if (!a) return [];
  return Object.keys(a)
    .filter((k) => !IGNORED.has(k) && !k.endsWith("Oid") && a[k] !== null)
    .filter((k) => !b || JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, from: b ? b[k] : undefined, to: a[k] }));
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("audit:read");
  const f = await searchParams;
  const [rows, types] = await Promise.all([queryAudit(user, f), auditEntityTypes()]);
  const filtered = Boolean(f.entityType || f.entityId || f.actor || f.action);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change across all apps, newest first. Entries are append-only and cannot be edited. Showing up to 200." />
      <form className="filters" method="get" data-testid="audit-filters">
        <select name="entityType" defaultValue={f.entityType ?? ""} aria-label="Entity type">
          <option value="">All record types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input name="entityId" placeholder="Record id" defaultValue={f.entityId ?? ""} aria-label="Record id" />
        <input name="actor" placeholder="Actor" defaultValue={f.actor ?? ""} aria-label="Actor" />
        <input name="action" placeholder="Action contains" defaultValue={f.action ?? ""} aria-label="Action" />
        <button type="submit">Filter</button>
        {filtered && <Link href="/audit" className="button ghost">Clear</Link>}
      </form>
      <div className="table-wrap">
        <table data-testid="audit-table">
          <thead>
            <tr><th>When / actor</th><th>Action</th><th>Record</th><th>Changes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = changes(r.before, r.after);
              return (
                <tr key={r.id} style={{ verticalAlign: "top" }}>
                  <td style={{ whiteSpace: "nowrap" }}>{r.actorUsername}<span className="sub">{formatDateTime(r.createdAt)}</span></td>
                  <td><code>{r.action}</code></td>
                  <td>{r.entityType}<span className="sub mono">{r.entityId}</span></td>
                  <td style={{ minWidth: 280, width: "42%" }}>
                    {diff.length > 0 ? (
                      <ul className="changes">
                        {diff.slice(0, 6).map((c) => (
                          <li key={c.key}>
                            <span className="k">{humanize(c.key)}:</span>{" "}
                            {c.from !== undefined && <><del>{show(c.from)}</del> → </>}
                            <ins>{show(c.to)}</ins>
                          </li>
                        ))}
                        {diff.length > 6 && <li className="muted">+{diff.length - 6} more</li>}
                      </ul>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {(r.before || r.after) && (
                      <details>
                        <summary>Full snapshot</summary>
                        <div className="stack" style={{ gap: ".4rem" }}>
                          <pre>Before: {r.before ? JSON.stringify(r.before, null, 1) : "—"}</pre>
                          <pre>After: {r.after ? JSON.stringify(r.after, null, 1) : "—"}</pre>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={4} className="empty">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
