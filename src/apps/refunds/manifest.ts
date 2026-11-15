import { defineApp } from "@/platform/apps/define";

export default defineApp({
  id: "refunds",
  name: "Refunds",
  description: "Refund requests: ≤ $100 auto-approve, larger refunds need maker-checker approval.",
  route: "/refunds",
  requiredPermission: "refunds:read",
  scopes: {
    // Agents see the requests they created; approvers and auditors (refunds:read_all) see all.
    RefundRequest: { ownerField: "createdByOid", allPermission: "refunds:read_all" },
  },
  pii: {
    RefundRequest: ["customerEmail", "cardLast4"],
  },
});
