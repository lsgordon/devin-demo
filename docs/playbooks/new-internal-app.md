# Playbook: new-internal-app

Build one internal app on the shared platform in `lsgordon/devin-demo`, touching only that app's files.

## Input

A short app spec: app id (e.g. `kyc`), entities and fields, which roles can do what, which fields are PII,
which actions need maker-checker. Permissions for the app (`<app>:read|read_all|write|approve`) already exist.

## Steps

1. **Read `AGENTS.md`** fully. Then read the reference app: `src/apps/example/*`, `src/app/(apps)/example/*`,
   `prisma/schema/example.prisma`, `e2e/example.authz.spec.ts`.
2. **Set up locally**: `docker compose up -d`, `cp .env.example .env`, `npm ci`, `npx prisma migrate deploy`,
   `npm run db:seed`. Branch: `devin/<timestamp>-<app>-app`.
3. **Schema**: create `prisma/schema/<app>.prisma` with the app's models (snake_case `@@map`/`@map`,
   owner fields such as `assigneeOid`/`createdByOid` storing user `oid`s). Run
   `npx prisma migrate dev --name <app>_init`. Commit.
4. **Manifest**: `src/apps/<app>/manifest.ts` via `defineApp({ id, name, route: "/<app>", requiredPermission: "<app>:read", scopes, pii })`.
   - a `scopes` rule for **every** model (owner field + `<app>:read_all`, a custom function, or explicit `"unscoped"`)
   - `pii` lists every PII field in the spec
5. **Seed**: `src/apps/<app>/seed.ts`, default export `async (db: PrismaClient) => {}`. Idempotent (fixed ids,
   upsert). Obviously fake data; assign rows to persona oids from `src/platform/auth/personas.ts` so scoping
   and maker-checker can be demoed (two makers, two checkers).
6. **Service**: `src/apps/<app>/service.ts` (`import "server-only"`). All reads via `scopedDb(user)`, all
   writes via `mutate(user, ...)` with `audit({ action, entityType, entityId, before, after })` on every state
   change. Maker-checker via `requestApproval` / `decideApproval` inside `mutate`, wherever the spec needs it.
   Enforce every business rule here (server-side), e.g. amount thresholds, environment rules, state transitions.
7. **Routes**: pages under `src/app/(apps)/<app>/` calling `requirePermission(...)`; server actions in
   `actions.ts` and route handlers wrapped with `withPermission(perm, handler)`. Map `NotFoundError` to 404
   (pages: `notFoundOnMissing` from `@/platform/ui/errors`, as in the example detail page). UI may hide controls
   with `hasPermission`, but never as the only check.
8. **Playwright spec** `e2e/<app>.authz.spec.ts`: one test per rule in the spec, logging in through the mock
   OIDC page (`login(page, "<persona>")`). Cover at least: who can open the app (403 for others, page and API);
   row scoping (out-of-scope = 404, same as nonexistent); every allowed and denied action per role, asserted
   server-side (call the action/API as the denied role, not only "button hidden"); raw PII absent from HTML,
   RSC payload and API for every role without `pii:read` (`expectNoRawPii`) and present for `pii:read`;
   maker-checker (maker cannot approve own item, a different checker can); auditor is read-only; audit rows are
   written for every state change. Reset only your own tables in `beforeAll`.
9. **Verify**: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`. All green.
10. **Rebase and PR**: `git fetch origin && git rebase origin/main`. If another app's migration merged first,
    delete your `prisma/schema/migrations/*_<app>_init` folder, `npm run db:reset`, regenerate with
    `npx prisma migrate dev --name <app>_init`, and re-run step 9. Open a PR to `main` and wait for CI to pass.
11. **Report**: PR link, CI status, rules covered by the e2e spec, and **the list of files touched outside
    `src/apps/<app>`** (expected: only `src/app/(apps)/<app>/**`, `prisma/schema/<app>.prisma`, its migration,
    `e2e/<app>.authz.spec.ts`). Get it with:
    `git diff --name-only origin/main... | grep -v '^src/apps/<app>/'`.

## Definition of done

- Only app-owned paths changed (see step 11); any exception is justified in the PR description
- Every route handler, server action and page enforces permissions server-side (enforcement test passes)
- Every list/detail query goes through `scopedDb`; every model has a scope rule; out-of-scope = 404
- Every PII field in the spec is declared in the manifest and proven absent for unprivileged roles
- Every state change is audited in the same transaction; maker-checker where the spec requires it
- `e2e/<app>.authz.spec.ts` has a test for every rule in the spec
- Lint, typecheck, Vitest, build, Playwright green locally and in CI; branch rebased on `main`

## Forbidden

- Editing `src/platform/authz/permissions.ts` (if a permission/role change is needed, say so in the PR; don't make it)
- Editing platform code: `src/platform/**`, `prisma/schema/platform.prisma`, the shell, `scripts/`, CI, other apps
- UI-only checks (hiding a control without server enforcement)
- Raw Prisma client, bypassing `scopedDb`/`mutate`, unaudited writes, real-looking personal data, secrets
- Saying "SOC 2 review"; say "security review"
