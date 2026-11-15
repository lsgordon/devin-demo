import Link from "next/link";

export default function Page() {
  return (
    <div className="card center-card" data-testid="error-403">
      <div className="code">Error 403</div>
      <h1>Access denied</h1>
      <p>You don&apos;t have permission to view this page.</p>
      <Link href="/" className="button primary">Back to home</Link>
    </div>
  );
}
