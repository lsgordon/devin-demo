import { requireUser } from "@/platform/authz";
import { auth } from "@/platform/auth/auth";
import { Avatar, PageHeader } from "@/platform/ui/components";

export default async function WhoAmI() {
  const user = await requireUser();
  const session = await auth();
  return (
    <>
      <PageHeader title="My access" subtitle="Your roles come from your company account. Permissions are derived from roles." />
      <div className="card" data-testid="whoami">
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
          <Avatar name={user.name || user.username} />
          <div>
            <strong>{user.name}</strong>
            <div className="muted small">{user.username}</div>
          </div>
        </div>
        <dl className="fields" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <dt>Roles</dt>
            <dd data-testid="whoami-roles">
              {user.roles.length ? user.roles.map((r) => <span key={r} className="badge">{r}</span>) : <em className="muted">none</em>}
            </dd>
          </div>
          <div>
            <dt>Permissions</dt>
            <dd data-testid="whoami-permissions">
              {[...user.permissions].sort().map((p) => <span key={p} className="badge mono">{p}</span>)}
            </dd>
          </div>
        </dl>
        <details style={{ marginTop: "1.25rem" }}>
          <summary>Token claims (for troubleshooting)</summary>
          <pre data-testid="whoami-claims">{JSON.stringify(session?.claims, null, 2)}</pre>
        </details>
      </div>
    </>
  );
}
