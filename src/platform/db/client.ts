import { PrismaClient } from "@prisma/client";

/**
 * RAW Prisma client. Platform-internal and seeds only (ESLint blocks it in app code).
 * Apps use scopedDb()/mutate() from @/platform/data.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
export const db = globalForPrisma.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = db;
