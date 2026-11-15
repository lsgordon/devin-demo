import { defineApp } from "@/platform/apps/define";

export default defineApp({
  id: "flags",
  name: "Feature flags",
  description: "Toggle features and roll them out per environment. Production changes need a second admin's approval.",
  route: "/flags",
  requiredPermission: "flags:read",
  scopes: {
    // Flags are global config, not owned rows: everyone with flags:read sees all of them.
    Flag: "unscoped",
    FlagChangeRequest: "unscoped",
  },
});
