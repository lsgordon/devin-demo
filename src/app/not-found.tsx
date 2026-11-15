import Link from "next/link";

export default function Page() {
  return (
    <div className="card" data-testid="error-404">
      <h1>404</h1>
      <p>This page or record does not exist, or you don&apos;t have access to it.</p>
      <Link href="/">Back to home</Link>
    </div>
  );
}
