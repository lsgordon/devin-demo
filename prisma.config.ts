import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Multi-file schema: shared models in prisma/schema/platform.prisma, one file per app.
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "schema", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
