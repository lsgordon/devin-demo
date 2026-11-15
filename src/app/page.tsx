import Link from "next/link";
import { requireUser } from "@/platform/authz";
import { appNavFor } from "@/platform/ui/nav";

export default async function Home() {
  const user = await requireUser();
  const apps = appNavFor(user);
  return (
    <>
      <h1>Welcome, {user.name}</h1>
      {apps.length === 0 && <p className="muted" data-testid="no-apps">You do not have access to any apps yet.</p>}
      <div className="cards">
        {apps.map((a) => (
          <Link key={a.id} href={a.href} className="card" data-testid={`app-card-${a.id}`}>
            <strong>{a.name}</strong>
            {a.description && <p className="muted">{a.description}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
