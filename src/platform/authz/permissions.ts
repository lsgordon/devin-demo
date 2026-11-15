/**
 * The ONLY place roles map to permissions. Platform-owned.
 * App PRs must NOT edit this file: permissions for kyc, refunds and flags are pre-declared.
 * Authorization reads only the `roles` claim from the IdP token.
 */

export const ROLES = [
  "kyc_analyst",
  "kyc_approver",
  "refunds_agent",
  "refunds_approver",
  "flags_admin",
  "auditor",
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // <app>:read      open the app; list/detail rows within the user's row scope
  // <app>:read_all  row scope = all rows (otherwise only rows assigned to / created by the user)
  // <app>:write     create/edit rows, request approval
  // <app>:approve   approve/reject maker-checker requests (never your own)
  "kyc:read", "kyc:read_all", "kyc:write", "kyc:approve",
  "refunds:read", "refunds:read_all", "refunds:write", "refunds:approve",
  "flags:read", "flags:read_all", "flags:write", "flags:approve",
  // Reference app that ships with the platform (src/apps/example) and backs the platform e2e tests.
  "example:read", "example:read_all", "example:write", "example:approve",
  "audit:read",
  "pii:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Roles that may see unmasked PII. Default: kyc_approver only. One-line change. */
export const PII_READ_ROLES: readonly Role[] = ["kyc_approver"];

const BASE_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  kyc_analyst: ["kyc:read", "kyc:write", "example:read", "example:write"],
  kyc_approver: ["kyc:read", "kyc:read_all", "kyc:approve", "example:read", "example:read_all", "example:approve"],
  refunds_agent: ["refunds:read", "refunds:write", "example:read", "example:write"],
  refunds_approver: ["refunds:read", "refunds:read_all", "refunds:approve", "example:read", "example:read_all", "example:approve"],
  // Two flags admins are seeded so flag changes can be maker-checker'd between them.
  flags_admin: ["flags:read", "flags:read_all", "flags:write", "flags:approve"],
  // Read-only everywhere.
  auditor: [
    "kyc:read", "kyc:read_all",
    "refunds:read", "refunds:read_all",
    "flags:read", "flags:read_all",
    "example:read", "example:read_all",
    "audit:read",
  ],
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = Object.fromEntries(
  ROLES.map((role) => [
    role,
    PII_READ_ROLES.includes(role) ? [...BASE_ROLE_PERMISSIONS[role], "pii:read"] : BASE_ROLE_PERMISSIONS[role],
  ]),
) as Record<Role, readonly Permission[]>;
