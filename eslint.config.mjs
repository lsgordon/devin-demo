import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // App code must go through the platform data layer (scoping, masking, audit).
    files: ["src/apps/**/*.{ts,tsx}", "src/app/(apps)/**/*.{ts,tsx}"],
    ignores: ["src/apps/*/seed.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/platform/db/client", message: "Use scopedDb()/mutate() from @/platform/data. Raw Prisma bypasses scoping, masking and audit." },
            { name: "@prisma/client", importNames: ["PrismaClient"], message: "Use scopedDb()/mutate() from @/platform/data." },
          ],
        },
      ],
    },
  },
];

export default config;
