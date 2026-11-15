import type { PrismaClient } from "@prisma/client";
import { persona } from "@/platform/auth/personas";

/** Obviously fake data. Idempotent (fixed ids + upsert). */
export default async function seed(db: PrismaClient) {
  const a1 = persona("kyc.analyst1").oid;
  const a2 = persona("kyc.analyst2").oid;
  const r1 = persona("refunds.agent1").oid;
  const rows = [
    { id: "example-0001", title: "Refund double charge", customerName: "Testy McTestface", dateOfBirth: "1990-01-01", idNumber: "TEST-0000-1234", amountCents: 1999, assigneeOid: a1 },
    { id: "example-0002", title: "Verify address change", customerName: "Sample O'Placeholder", dateOfBirth: "1985-05-05", idNumber: "TEST-0000-5678", amountCents: 0, assigneeOid: a1 },
    { id: "example-0003", title: "Chargeback review", customerName: "Fakey McFakeface", dateOfBirth: "1970-12-31", idNumber: "TEST-0000-9012", amountCents: 4200, assigneeOid: a2 },
    { id: "example-0004", title: "Goodwill credit", customerName: "Demo McDemoface", dateOfBirth: "2000-02-29", idNumber: "TEST-0000-3456", amountCents: 500, assigneeOid: r1 },
  ];
  for (const row of rows) {
    await db.exampleRequest.upsert({ where: { id: row.id }, create: row, update: row });
  }
}
