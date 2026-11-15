import { ForbiddenError } from "./errors";
import { ROLE_PERMISSIONS, ROLES, type Permission, type Role } from "./permissions";

/** The authenticated principal. Built only from IdP claims. */
export type CurrentUser = {
  oid: string;
  tid: string;
  username: string; // preferred_username
  name: string;
  roles: Role[];
  permissions: ReadonlySet<Permission>;
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Unknown role strings are ignored (deny by default). */
export function permissionsForRoles(roles: readonly unknown[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    if (isRole(role)) for (const p of ROLE_PERMISSIONS[role]) out.add(p);
  }
  return out;
}

export function buildUser(claims: {
  oid: string;
  tid: string;
  username: string;
  name: string;
  roles: readonly unknown[];
}): CurrentUser {
  const roles = claims.roles.filter(isRole);
  return { ...claims, roles, permissions: permissionsForRoles(roles) };
}

export function hasPermission(user: Pick<CurrentUser, "permissions"> | null | undefined, perm: Permission): boolean {
  return !!user && user.permissions.has(perm);
}

export function assertPermission(user: CurrentUser, perm: Permission): void {
  if (!hasPermission(user, perm)) throw new ForbiddenError(`Missing permission ${perm}`);
}
