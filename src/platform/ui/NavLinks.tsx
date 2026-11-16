"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./nav";

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Apps" data-testid="nav">
      {items.map((a) => {
        const active = pathname === a.href || pathname.startsWith(`${a.href}/`);
        return (
          <Link key={a.id} href={a.href} data-testid={`nav-${a.id}`} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {a.name}
          </Link>
        );
      })}
    </nav>
  );
}
