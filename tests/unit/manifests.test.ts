/** Every app follows the layout + declares scopes for every model it owns. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPS } from "@/platform/apps/registry";
import { PERMISSIONS } from "@/platform/authz/permissions";

const ROOT = path.resolve(__dirname, "../..");
const appDirs = readdirSync(path.join(ROOT, "src/apps"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

function modelsIn(schemaFile: string): Map<string, string[]> {
  const src = readFileSync(schemaFile, "utf8");
  const out = new Map<string, string[]>();
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields = m[2].split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((f) => f && !f.startsWith("@@") && !f.startsWith("//"));
    out.set(m[1], fields);
  }
  return out;
}

describe("app manifests", () => {
  it("every src/apps/<app> has a manifest that was auto-discovered", () => {
    expect(APPS.map((a) => a.id).sort()).toEqual(appDirs.filter((d) => existsSync(path.join(ROOT, "src/apps", d, "manifest.ts"))).sort());
  });

  for (const app of APPS) {
    describe(app.id, () => {
      const schema = path.join(ROOT, "prisma/schema", `${app.id}.prisma`);
      const models = existsSync(schema) ? modelsIn(schema) : new Map<string, string[]>();

      it("id matches folder, route is /<id>, permission is declared", () => {
        expect(appDirs).toContain(app.id);
        expect(app.route).toBe(`/${app.id}`);
        expect(PERMISSIONS).toContain(app.requiredPermission);
        expect(existsSync(path.join(ROOT, "src/app/(apps)", app.id))).toBe(true);
      });

      it("declares a scope rule for every model in prisma/schema/<app>.prisma", () => {
        expect(Object.keys(app.scopes).sort()).toEqual([...models.keys()].sort());
      });

      it("PII fields exist on their models", () => {
        for (const [model, fields] of Object.entries(app.pii ?? {})) {
          expect(models.has(model), `${model} not in ${app.id}.prisma`).toBe(true);
          for (const f of fields) expect(models.get(model)).toContain(f);
        }
      });
    });
  }
});
