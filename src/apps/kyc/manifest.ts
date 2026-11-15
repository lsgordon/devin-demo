import { defineApp } from "@/platform/apps/define";
import { hasPermission } from "@/platform/authz/core";

export default defineApp({
  id: "kyc",
  name: "KYC cases",
  description: "Review customer KYC cases: analyst recommendation, approver final decision (maker-checker).",
  route: "/kyc",
  requiredPermission: "kyc:read",
  scopes: {
    // Analysts see cases assigned to them; kyc:read_all (approver, auditor) sees every case.
    KycCase: { ownerField: "assigneeOid", allPermission: "kyc:read_all" },
    // Notes follow their case's scope.
    KycNote: (user) => (hasPermission(user, "kyc:read_all") ? null : { case: { assigneeOid: user.oid } }),
  },
  pii: {
    KycCase: ["dateOfBirth", "nationalId"],
  },
});
