import type { CurrentUser } from "@/platform/authz/core";
import type { Permission } from "@/platform/authz/permissions";

/**
 * Row-scope rule for one Prisma model:
 *  - { ownerField, allPermission }: users with `allPermission` see all rows, everyone else only rows where
 *    `ownerField` equals their oid.
 *  - a function returning an extra Prisma `where` (or null for "no restriction") for custom rules.
 *  - "unscoped": explicitly no row restriction (e.g. feature flags). Must be stated, never implied.
 */
export type ScopeRule =
  | { ownerField: string; allPermission: Permission }
  | ((user: CurrentUser) => Record<string, unknown> | null)
  | "unscoped";

export type AppManifest = {
  /** Folder name under src/apps and src/app/(apps). */
  id: string;
  name: string;
  description?: string;
  /** URL path of the app home, e.g. "/kyc". */
  route: string;
  /** Permission needed to see the app in the nav and open it. */
  requiredPermission: Permission;
  /** Row scoping for EVERY Prisma model this app owns (keyed by Prisma model name). */
  scopes: Record<string, ScopeRule>;
  /** PII fields per model. Masked server-side unless the user has pii:read. */
  pii?: Record<string, readonly string[]>;
};

export function defineApp<const M extends AppManifest>(manifest: M): M {
  return manifest;
}
