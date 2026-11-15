/**
 * Keeps every app honest: fails if any route handler, server action or page under src/app
 * is not protected by the platform authz wrappers.
 *
 *  - route.ts: every exported HTTP method must be `export const GET = withPermission(...)` (or publicRoute for platform-only public endpoints)
 *  - "use server" files: every export must be `export const x = withPermission(...)`
 *  - inline "use server" inside functions is forbidden (it would bypass this check)
 *  - page.tsx: must call requirePermission(...) or requireUser(...) (allowlist: PUBLIC_PAGES)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP_DIR = path.resolve(__dirname, "../../src/app");
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const ROUTE_WRAPPERS = new Set(["withPermission", "publicRoute"]);
const PUBLIC_ROUTES = new Set(["api/auth/[...nextauth]/route.ts"]); // only these may use publicRoute
const PUBLIC_PAGES = new Set(["login/page.tsx"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const parse = (file: string) => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const rel = (file: string) => path.relative(APP_DIR, file).split(path.sep).join("/");
const isExported = (n: ts.Node) =>
  ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const calleeName = (e: ts.Expression | undefined) =>
  e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : undefined;
const hasTopLevelUseServer = (sf: ts.SourceFile) =>
  sf.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server");

/** Returns problems with the exports of a module: each export must be a const initialised by one of `wrappers`. */
function checkExports(sf: ts.SourceFile, filter: (name: string) => boolean, wrappers: Set<string>): string[] {
  const problems: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name && filter(stmt.name.text)) {
      problems.push(`export function ${stmt.name.text} is not wrapped (use: export const ${stmt.name.text} = withPermission(...))`);
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) {
          problems.push(`destructured export is not allowed; export each handler with withPermission(...)`);
          continue;
        }
        if (filter(d.name.text) && !wrappers.has(calleeName(d.initializer) ?? "")) {
          problems.push(`export ${d.name.text} is not wrapped with ${[...wrappers].join("/")}`);
        }
      }
    }
    if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) problems.push(`re-exports are not allowed in protected modules`);
    if (ts.isExportAssignment(stmt) && wrappers.has("withPermission") && !ts.isIdentifier(stmt.expression)) {
      // default exports are fine for pages; for routes/actions they are meaningless
    }
  }
  return problems;
}

function findInlineUseServer(sf: ts.SourceFile): number {
  let count = 0;
  const visit = (n: ts.Node) => {
    if ((ts.isFunctionLike(n) && "body" in n && n.body && ts.isBlock(n.body as ts.Node))) {
      const body = n.body as ts.Block;
      if (body.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server")) count++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return count;
}

function callsAny(sf: ts.SourceFile, names: string[]): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.includes(n.expression.text)) found = true;
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const files = walk(APP_DIR);

describe("server-side enforcement on every entry point under src/app", () => {
  const routes = files.filter((f) => /(^|\/)route\.tsx?$/.test(rel(f)));
  it.each(routes.map(rel))("route handler %s is wrapped", (r) => {
    const sf = parse(path.join(APP_DIR, r));
    const wrappers = PUBLIC_ROUTES.has(r) ? ROUTE_WRAPPERS : new Set(["withPermission"]);
    expect(checkExports(sf, (n) => HTTP_METHODS.has(n), wrappers)).toEqual([]);
  });

  const actionFiles = files.filter((f) => hasTopLevelUseServer(parse(f)));
  it.each(actionFiles.map(rel))("server actions in %s are wrapped with withPermission", (r) => {
    expect(checkExports(parse(path.join(APP_DIR, r)), () => true, new Set(["withPermission"]))).toEqual([]);
  });

  it("no inline 'use server' functions anywhere in src (put actions in a 'use server' file)", () => {
    const srcFiles = walk(path.resolve(APP_DIR, ".."));
    const offenders = srcFiles.filter((f) => findInlineUseServer(parse(f)) > 0).map((f) => path.relative(APP_DIR, f));
    expect(offenders).toEqual([]);
  });

  const pages = files.filter((f) => /(^|\/)page\.tsx$/.test(rel(f)) && !PUBLIC_PAGES.has(rel(f)));
  it.each(pages.map(rel))("page %s calls requirePermission()/requireUser()", (r) => {
    expect(callsAny(parse(path.join(APP_DIR, r)), ["requirePermission", "requireUser"])).toBe(true);
  });

  it("finds the platform entry points (sanity check for the scanner)", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(actionFiles.length).toBeGreaterThan(0);
    expect(pages.length).toBeGreaterThan(0);
  });

  it("detects an unwrapped handler (self-test)", () => {
    const sf = ts.createSourceFile("x.ts", "export async function GET() {}\nexport const POST = async () => {};", ts.ScriptTarget.Latest, true);
    expect(checkExports(sf, (n) => HTTP_METHODS.has(n), new Set(["withPermission"]))).toHaveLength(2);
    const inline = ts.createSourceFile("y.tsx", "export default function P(){ async function a(){ 'use server'; } }", ts.ScriptTarget.Latest, true);
    expect(findInlineUseServer(inline)).toBe(1);
  });
});
