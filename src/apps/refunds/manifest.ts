import { defineApp } from "@/platform/apps/define";

export default defineApp({
  id: "refunds",
  name: "Refunds",
  description: "Raise and approve customer refunds. Up to $100 is approved instantly; larger refunds need a second approver.",
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
