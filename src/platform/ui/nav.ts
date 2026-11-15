import type { CurrentUser } from "@/platform/authz/core";
import { hasPermission } from "@/platform/authz/core";
import type { Permission } from "@/platform/authz/permissions";
import { APPS } from "@/platform/apps/registry";

export type NavItem = { id: string; name: string; href: string; description?: string };

const PLATFORM_LINKS: { id: string; name: string; href: string; permission?: Permission }[] = [
  { id: "audit", name: "Audit log", href: "/audit", permission: "audit:read" },
  { id: "whoami", name: "My access", href: "/whoami" },
];

/** Apps the user may open (from auto-discovered manifests), filtered by each manifest's requiredPermission. */
export function appNavFor(user: CurrentUser): NavItem[] {
  return APPS.filter((m) => hasPermission(user, m.requiredPermission)).map((m) => ({
    id: m.id,
    name: m.name,
    href: m.route,
    description: m.description,
  }));
}

export function platformNavFor(user: CurrentUser): NavItem[] {
  return PLATFORM_LINKS.filter((l) => !l.permission || hasPermission(user, l.permission));
}
