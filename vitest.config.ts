import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": new URL("./tests/support/server-only.ts", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["dotenv/config"],
    // DB tests share one Postgres; keep files sequential.
    fileParallelism: false,
  },
});
