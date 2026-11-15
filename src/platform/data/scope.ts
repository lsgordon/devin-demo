import type { CurrentUser } from "@/platform/authz/core";
import { hasPermission } from "@/platform/authz/core";
import type { ScopeRule } from "@/platform/apps/define";

/** Matches nothing. Used to deny-all without leaking existence. */
export const DENY_ALL = { id: { in: [] as string[] } };

/** Returns the extra `where` for a rule, or null when the user may see every row. */
export function scopeWhere(user: CurrentUser, rule: ScopeRule): Record<string, unknown> | null {
  if (rule === "unscoped") return null;
  if (typeof rule === "function") return rule(user);
  return hasPermission(user, rule.allPermission) ? null : { [rule.ownerField]: user.oid };
}

/** Adds the scope to a Prisma `where` while keeping unique fields at the top level (valid for findUnique/update/delete). */
export function applyScope<W extends Record<string, unknown> | undefined>(where: W, scope: Record<string, unknown> | null): W {
  if (!scope) return where;
  const base = (where ?? {}) as Record<string, unknown>;
  const existingAnd = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...existingAnd, scope] } as unknown as W;
}
