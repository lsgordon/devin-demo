import type { PrismaClient } from "@prisma/client";
import { persona } from "@/platform/auth/personas";

/** Obviously fake data. Idempotent (fixed ids + upsert). */
export default async function seed(db: PrismaClient) {
  const a1 = persona("flags.admin1").oid;
  const a2 = persona("flags.admin2").oid;
  const rows = [
    { id: "flag-dev-new-checkout", key: "new-checkout", environment: "dev", description: "Redesigned checkout flow", enabled: true, rolloutPercent: 100, createdByOid: a1, updatedByOid: a1 },
    { id: "flag-staging-new-checkout", key: "new-checkout", environment: "staging", description: "Redesigned checkout flow", enabled: true, rolloutPercent: 50, createdByOid: a1, updatedByOid: a1 },
    { id: "flag-prod-new-checkout", key: "new-checkout", environment: "prod", description: "Redesigned checkout flow", enabled: false, rolloutPercent: 0, createdByOid: a1, updatedByOid: a2 },
    { id: "flag-dev-dark-mode", key: "dark-mode", environment: "dev", description: "Dark theme for the dashboard", enabled: true, rolloutPercent: 100, createdByOid: a2, updatedByOid: a2 },
    { id: "flag-prod-dark-mode", key: "dark-mode", environment: "prod", description: "Dark theme for the dashboard", enabled: true, rolloutPercent: 10, createdByOid: a2, updatedByOid: a1 },
  ] as const;
  for (const row of rows) {
    await db.flag.upsert({ where: { id: row.id }, create: row, update: row });
  }
}
