import { requireUser } from "@/platform/authz";
import { auth } from "@/platform/auth/auth";

export default async function WhoAmI() {
  const user = await requireUser();
  const session = await auth();
  return (
    <>
      <h1>Who am I</h1>
      <div className="card" data-testid="whoami">
        <p><strong>{user.name}</strong> ({user.username})</p>
        <p>
          Roles:{" "}
          <span data-testid="whoami-roles">
            {user.roles.length ? user.roles.map((r) => <span key={r} className="badge">{r}</span>) : <em className="muted">none</em>}
          </span>
        </p>
        <p>
          Permissions:{" "}
          <span data-testid="whoami-permissions">
            {[...user.permissions].sort().map((p) => <span key={p} className="badge">{p}</span>)}
          </span>
        </p>
        <h3>Token claims used by the platform</h3>
        <pre data-testid="whoami-claims">{JSON.stringify(session?.claims, null, 2)}</pre>
      </div>
    </>
  );
}
