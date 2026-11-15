import { defineApp } from "@/platform/apps/define";

/**
 * Reference app shipped with the platform. Copy its structure for new apps.
 * It also backs the platform e2e tests (scoping, masking, maker-checker).
 */
export default defineApp({
  id: "example",
  name: "Example requests",
  description: "Reference app: scoped list, masked PII, maker-checker approval.",
  route: "/example",
  requiredPermission: "example:read",
  scopes: {
    // Makers see rows assigned to them; users with example:read_all see everything.
    ExampleRequest: { ownerField: "assigneeOid", allPermission: "example:read_all" },
  },
  pii: {
    ExampleRequest: ["dateOfBirth", "idNumber"],
  },
});
