import Link from "next/link";
import { requireUser } from "@/platform/authz";
import { appNavFor } from "@/platform/ui/nav";
import { PageHeader } from "@/platform/ui/components";
import { humanize } from "@/platform/ui/format";

export default async function Home() {
  const user = await requireUser();
  const apps = appNavFor(user);
  const firstName = (user.name || user.username).split(/\s+/)[0];
  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={
          user.roles.length ? (
            <>Signed in as {user.roles.map((r) => <span key={r} className="badge">{humanize(r)}</span>)}</>
          ) : (
            "Your account has no roles assigned yet."
          )
        }
      />
      {apps.length === 0 && (
        <div className="card center-card" data-testid="no-apps" style={{ margin: "2rem auto" }}>
          <h2>No apps yet</h2>
          <p style={{ marginBottom: 0 }}>You do not have access to any apps yet. Ask your manager to request a role for you.</p>
        </div>
      )}
      <div className="cards">
        {apps.map((a) => (
          <Link key={a.id} href={a.href} className="card app-card" data-testid={`app-card-${a.id}`}>
            <span className="app-icon" aria-hidden>{a.name[0]}</span>
            <strong>{a.name}</strong>
            {a.description && <p>{a.description}</p>}
            <span className="open">Open →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
