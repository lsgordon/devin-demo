import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/platform/authz";
import { appNavFor, platformNavFor } from "@/platform/ui/nav";
import { SignOutButton } from "@/platform/ui/AuthButtons";
import "./globals.css";

export const metadata: Metadata = { title: "Internal tools" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="shell">
          <Link href="/" className="brand">Internal tools</Link>
          {user && (
            <nav aria-label="Apps" data-testid="nav">
              {appNavFor(user).map((a) => (
                <Link key={a.id} href={a.href} data-testid={`nav-${a.id}`}>{a.name}</Link>
              ))}
              {platformNavFor(user).map((a) => (
                <Link key={a.id} href={a.href} data-testid={`nav-${a.id}`}>{a.name}</Link>
              ))}
            </nav>
          )}
          {user && (
            <div className="me">
              <span data-testid="current-user">{user.username}</span>
              <SignOutButton />
            </div>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
