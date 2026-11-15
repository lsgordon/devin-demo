/**
 * Seed runner. Auto-discovers src/apps/<app>/seed.ts (default export: async (db) => void)
 * so app PRs never edit this file. Seeds must be idempotent (use upsert with fixed ids).
 */
import "dotenv/config";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const appsDir = path.resolve(import.meta.dirname, "..", "src", "apps");

async function main() {
  const apps = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(appsDir, d.name, "seed.ts")))
    .map((d) => d.name)
    .sort();
  for (const app of apps) {
    const mod = await import(pathToFileURL(path.join(appsDir, app, "seed.ts")).href);
    const seed = mod.default?.default ?? mod.default;
    if (typeof seed !== "function") throw new Error(`src/apps/${app}/seed.ts must default-export a function`);
    await seed(db);
    console.log(`seeded: ${app}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
