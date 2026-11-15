import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/platform/authz";
import { appNavFor, platformNavFor } from "@/platform/ui/nav";
import { NavLinks } from "@/platform/ui/NavLinks";
import { Avatar } from "@/platform/ui/components";
import { SignOutButton } from "@/platform/ui/AuthButtons";
import "./globals.css";

export const metadata: Metadata = { title: "Internal tools" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="shell">
          <Link href="/" className="brand"><span className="logo">IT</span>Internal tools</Link>
          {user ? <NavLinks items={[...appNavFor(user), ...platformNavFor(user)]} /> : <span style={{ flex: 1 }} />}
          {user && (
            <div className="me">
              <div className="who">
                <strong>{user.name}</strong>
                <span data-testid="current-user">{user.username}</span>
              </div>
              <Avatar name={user.name || user.username} />
              <SignOutButton />
            </div>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
