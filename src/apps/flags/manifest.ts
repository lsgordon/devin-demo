import { defineApp } from "@/platform/apps/define";

export default defineApp({
  id: "flags",
  name: "Feature flags",
  description: "Feature flags per environment. Prod changes need approval by a second flags admin.",
  route: "/flags",
  requiredPermission: "flags:read",
  scopes: {
    // Flags are global config, not owned rows: everyone with flags:read sees all of them.
    Flag: "unscoped",
    FlagChangeRequest: "unscoped",
  },
});
