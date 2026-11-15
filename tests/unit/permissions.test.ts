import { describe, expect, it } from "vitest";
import { PERMISSIONS, PII_READ_ROLES, ROLE_PERMISSIONS, ROLES } from "@/platform/authz/permissions";
import { buildUser, hasPermission, assertPermission, permissionsForRoles } from "@/platform/authz/core";
import { ForbiddenError } from "@/platform/authz/errors";

describe("permissions", () => {
  it("pre-declares kyc, refunds, flags, audit and pii permissions", () => {
    for (const app of ["kyc", "refunds", "flags"]) {
      for (const verb of ["read", "read_all", "write", "approve"]) expect(PERMISSIONS).toContain(`${app}:${verb}`);
    }
    expect(PERMISSIONS).toContain("audit:read");
    expect(PERMISSIONS).toContain("pii:read");
  });

  it("grants pii:read to kyc_approver only by default", () => {
    expect(PII_READ_ROLES).toEqual(["kyc_approver"]);
    for (const role of ROLES) expect(ROLE_PERMISSIONS[role].includes("pii:read")).toBe(role === "kyc_approver");
  });

  it("auditor is read-only everywhere and can read the audit log", () => {
    const perms = ROLE_PERMISSIONS.auditor;
    expect(perms).toContain("audit:read");
    expect(perms.filter((p) => /:(write|approve)$/.test(p))).toEqual([]);
    for (const app of ["kyc", "refunds", "flags"]) expect(perms).toContain(`${app}:read`);
  });

  it("makers cannot approve and checkers cannot write in the same app", () => {
    expect(ROLE_PERMISSIONS.kyc_analyst).not.toContain("kyc:approve");
    expect(ROLE_PERMISSIONS.kyc_approver).not.toContain("kyc:write");
    expect(ROLE_PERMISSIONS.refunds_agent).not.toContain("refunds:approve");
    expect(ROLE_PERMISSIONS.refunds_approver).not.toContain("refunds:write");
  });

  it("ignores unknown roles (deny by default) and non-string roles", () => {
    expect([...permissionsForRoles(["Global Administrator", 42, null])]).toEqual([]);
    const u = buildUser({ oid: "o", tid: "t", username: "u", name: "n", roles: ["kyc_analyst", "bogus"] });
    expect(u.roles).toEqual(["kyc_analyst"]);
  });

  it("assertPermission throws ForbiddenError (403)", () => {
    const u = buildUser({ oid: "o", tid: "t", username: "u", name: "n", roles: ["kyc_analyst"] });
    expect(hasPermission(u, "kyc:read")).toBe(true);
    expect(() => assertPermission(u, "audit:read")).toThrow(ForbiddenError);
    expect(hasPermission(null, "kyc:read")).toBe(false);
  });
});
