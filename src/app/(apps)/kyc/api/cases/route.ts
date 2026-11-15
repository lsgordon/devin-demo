import { withPermission } from "@/platform/authz";
import { listCases } from "@/apps/kyc/service";

// GET /kyc/api/cases -> cases in the caller's row scope, PII masked unless pii:read.
export const GET = withPermission("kyc:read", async (user) => Response.json(await listCases(user)));
