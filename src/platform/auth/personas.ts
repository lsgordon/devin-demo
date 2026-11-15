import type { Role } from "@/platform/authz/permissions";

/**
 * MOCK personas for local dev, e2e tests and seeds. Obviously fake.
 * Used to generate mock-oidc/login.html (npm run gen). Never used for authorization:
 * authorization reads the `roles` claim from the token only.
 */
export const MOCK_TENANT_ID = "11111111-1111-4111-8111-111111111111";

export type Persona = {
  key: string;
  oid: string;
  name: string;
  preferred_username: string;
  roles: Role[];
};

const p = (n: number, key: string, name: string, roles: Role[]): Persona => ({
  key,
  oid: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name,
  preferred_username: `${key}@example.com`,
  roles,
});

export const PERSONAS = [
  p(101, "kyc.analyst1", "Testy McTestface", ["kyc_analyst"]),
  p(102, "kyc.analyst2", "Fakey McFakeface", ["kyc_analyst"]),
  p(201, "kyc.approver1", "Approvy McApproveface", ["kyc_approver"]),
  p(202, "kyc.approver2", "Checky McCheckface", ["kyc_approver"]),
  p(301, "refunds.agent1", "Refundy McRefundface", ["refunds_agent"]),
  p(302, "refunds.agent2", "Moneyback McTestface", ["refunds_agent"]),
  p(401, "refunds.approver1", "Payout McPayoutface", ["refunds_approver"]),
  p(402, "refunds.approver2", "Ledger McLedgerface", ["refunds_approver"]),
  p(501, "flags.admin1", "Toggly McToggleface", ["flags_admin"]),
  p(502, "flags.admin2", "Switchy McSwitchface", ["flags_admin"]),
  p(601, "auditor1", "Audity McAuditface", ["auditor"]),
  p(901, "noroles", "Nobody McNoroles", []),
] as const satisfies readonly Persona[];

export type PersonaKey = (typeof PERSONAS)[number]["key"];

export function persona(key: PersonaKey): Persona {
  const found = PERSONAS.find((x) => x.key === key);
  if (!found) throw new Error(`Unknown persona ${key}`);
  return found;
}
