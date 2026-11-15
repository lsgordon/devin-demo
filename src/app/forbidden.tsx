import Link from "next/link";

export default function Page() {
  return (
    <div className="card" data-testid="error-403">
      <h1>403</h1>
      <p>You don't have permission to view this page.</p>
      <Link href="/">Back to home</Link>
    </div>
  );
}
