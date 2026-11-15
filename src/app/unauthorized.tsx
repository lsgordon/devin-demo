import Link from "next/link";

export default function Page() {
  return (
    <div className="card center-card" data-testid="error-401">
      <div className="code">Error 401</div>
      <h1>Sign in required</h1>
      <p>Please sign in to continue.</p>
      <Link href="/login" className="button primary">Sign in</Link>
    </div>
  );
}
