import Link from "next/link";

export default function Page() {
  return (
    <div className="card center-card" data-testid="error-404">
      <div className="code">Error 404</div>
      <h1>Not found</h1>
      <p>This page or record does not exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="button primary">Back to home</Link>
    </div>
  );
}
