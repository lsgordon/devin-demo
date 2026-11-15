import { PERSONAS } from "@/platform/auth/personas";

/**
 * Assignable KYC analysts. Locally this is the mock persona directory; in production it would come
 * from the IdP directory (e.g. members of the kyc_analyst app role). Used for display and to validate
 * reassignment targets, never for authorization.
 */
export const KYC_ANALYSTS: readonly { oid: string; name: string; username: string }[] = PERSONAS.filter((p) =>
  (p.roles as readonly string[]).includes("kyc_analyst"),
).map((p) => ({ oid: p.oid, name: p.name, username: p.preferred_username }));

export const isKycAnalyst = (oid: string) => KYC_ANALYSTS.some((a) => a.oid === oid);

export const analystLabel = (oid: string | null) =>
  oid === null ? "Unassigned" : (KYC_ANALYSTS.find((a) => a.oid === oid)?.username ?? oid);
