import type { Prisma, PrismaClient } from "@prisma/client";
import { persona } from "@/platform/auth/personas";

/** Obviously fake customer submissions. Idempotent (fixed ids + upsert); re-seeding resets case state. */
export default async function seed(db: PrismaClient) {
  const a1 = persona("kyc.analyst1").oid;
  const a2 = persona("kyc.analyst2").oid;
  const reset = { status: "SUBMITTED", recommendation: null, recommendedByOid: null, recommendationReason: null } as const;
  const rows: Prisma.KycCaseUncheckedCreateInput[] = [
    { id: "kyc-0001", customerName: "Custy McCustomerface", dateOfBirth: "1991-03-14", nationalId: "TEST-0000-1111", documentType: "PASSPORT", riskScore: 12, assigneeOid: a1, ...reset },
    { id: "kyc-0002", customerName: "Sample O'Placeholder", dateOfBirth: "1984-07-22", nationalId: "TEST-0000-2222", documentType: "DRIVERS_LICENSE", riskScore: 47, assigneeOid: a1, ...reset },
    { id: "kyc-0003", customerName: "Demo McDemoface", dateOfBirth: "1975-11-02", nationalId: "TEST-0000-3333", documentType: "NATIONAL_ID_CARD", riskScore: 81, assigneeOid: a2, ...reset },
    { id: "kyc-0004", customerName: "Fakey Fakerson", dateOfBirth: "2001-05-30", nationalId: "TEST-0000-4444", documentType: "PASSPORT", riskScore: 63, assigneeOid: null, ...reset },
  ];
  for (const row of rows) {
    await db.kycCase.upsert({ where: { id: row.id }, create: row, update: row });
  }
}
