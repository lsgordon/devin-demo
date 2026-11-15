import Link from "next/link";

export default function Page() {
  return (
    <div className="card" data-testid="error-401">
      <h1>401</h1>
      <p>Please sign in.</p>
      <Link href="/login">Sign in</Link>
    </div>
  );
}
