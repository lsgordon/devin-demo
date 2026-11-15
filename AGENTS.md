# AGENTS.md — conventions for this repo

This repo is the shared platform for internal tools (replacing Power Apps). Apps are built on it, often by
several sessions in parallel. These rules keep app PRs fast, consistent and **conflict-free when merged**.
To build a new app, follow `docs/playbooks/new-internal-app.md`.

## Layout and ownership

| Path | Owner | Notes |
|---|---|---|
| `src/platform/**` | platform | Auth, authz, data, audit, approvals, PII, shell UI. **App PRs do not edit.** |
| `src/platform/authz/permissions.ts` | platform | The only role → permission map. **Never edit in an app PR.** |
| `prisma/schema/platform.prisma` | platform | `AuditLog`, `Approval`. |
| `src/app/layout.tsx`, `src/app/(platform)/**`, `src/app/login`, `src/app/api/auth` | platform | Shell, whoami, audit viewer, login. |
| `src/apps/<app>/**` | app | `manifest.ts`, `seed.ts`, `service.ts`, other logic. |
| `src/app/(apps)/<app>/**` | app | Pages, `actions.ts`, route handlers. |
| `prisma/schema/<app>.prisma` | app | The app's models (one file per app). |
| `prisma/schema/migrations/<ts>_<app>_*/` | app | The app's own migration. |
| `e2e/<app>.authz.spec.ts` | app | The app's Playwright authz spec. |

An app PR should touch **only** the app-owned paths above. Nothing else needs editing:

- **Nav / registry**: auto-discovered from `src/apps/*/manifest.ts` by `scripts/generate-registry.ts`
  (runs on `dev`, `build`, `lint`, `typecheck`, `test`). The output `registry.generated.ts` is gitignored.
- **Seeds**: `prisma/seed.ts` auto-discovers `src/apps/*/seed.ts` (default export `async (db) => {}`).
- **e2e**: Playwright picks up `e2e/*.authz.spec.ts`.

`src/apps/example` + `src/app/(apps)/example` + `e2e/example.authz.spec.ts` is the reference app. Copy its shape.

## Permissions (read-only for apps)

Authorization reads **only the `roles` claim** of the OIDC token. `permissions.ts` maps roles to permissions.
Permissions for `kyc`, `refunds`, `flags` are pre-declared:

- `<app>:read` open the app; list/detail within your row scope
- `<app>:read_all` row scope = all rows
- `<app>:write` create/edit, request approval
- `<app>:approve` approve/reject maker-checker requests (never your own)
- `audit:read`, `pii:read` (default: `kyc_approver` only, via `PII_READ_ROLES`)

If the spec seems to need a permission that does not exist or a different role mapping, **do not edit
`permissions.ts`**. Use the existing permissions and list the needed change in the PR description for a platform PR.

## 1. Authz wrapper: every entry point, server-side

```ts
import { withPermission, requirePermission, requireUser } from "@/platform/authz";

// Server action (src/app/(apps)/<app>/actions.ts, file starts with "use server")
export const approveAction = withPermission("kyc:approve", async (user, formData: FormData) => { ... });

// Route handler
export const GET = withPermission("kyc:read", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => { ... });

// Page / layout (server component)
const user = await requirePermission("kyc:read");
```

- Missing session → 401 (APIs) / redirect to `/login` (pages). Missing permission → **403**.
  Row missing or out of scope → **404** (`NotFoundError`), so existence never leaks.
- `tests/unit/enforcement.test.ts` fails CI if any exported route handler or server action under `src/app`
  is not wrapped, or any page does not call `requireUser`/`requirePermission`.
- Hiding a button is never the check. **UI-only checks are forbidden**; the server must enforce every rule.
  You can additionally hide UI with `hasPermission(user, perm)`.

## 2. Scoping helper: every list and detail query

App code never imports `@prisma/client`'s `PrismaClient` or `@/platform/db/client` (ESLint blocks it).
Use `scopedDb(user)` for reads and `mutate(user, fn)` for writes:

```ts
import { scopedDb, mutate } from "@/platform/data";
const rows = await scopedDb(user).kycCase.findMany({ orderBy: { createdAt: "desc" } });
const one  = await scopedDb(user).kycCase.findUniqueOrThrow({ where: { id } }); // 404 if out of scope
```

Declare a scope rule for **every model** the app owns in its manifest (missing rule = runtime error):

```ts
scopes: {
  KycCase: { ownerField: "assigneeOid", allPermission: "kyc:read_all" }, // owners see theirs; read_all sees all
  KycNote: (user) => (hasPermission(user, "kyc:read_all") ? null : { case: { assigneeOid: user.oid } }), // custom
  Flag: "unscoped", // explicit
}
```

Scope is applied to find*/count/aggregate/groupBy/update*/delete*. `upsert` on a scoped model is blocked.

## 3. Masking declarations

```ts
pii: { KycCase: ["dateOfBirth", "nationalId"] }
```

Results from `scopedDb`/`mutate` are masked server-side (`••••1234`, last 4 kept) unless the user has `pii:read`,
before anything reaches an RSC payload or API response. Never read PII through another path. Writing a masked
value back into a PII field throws. The app e2e spec must prove raw PII is absent for unprivileged roles
(`expectNoRawPii` in `e2e/helpers.ts`).

## 4. Audit in the same transaction

Every state change goes through `mutate`, which opens one transaction, gives you a scoped `tx` and `audit()`,
and **rolls back if no audit entry was written**:

```ts
return mutate(user, async ({ tx, audit }) => {
  const before = await tx.kycCase.findUniqueOrThrow({ where: { id } });
  const after = await tx.kycCase.update({ where: { id }, data: { status: "IN_REVIEW" } });
  await audit({ action: "kyc_case.start_review", entityType: "KycCase", entityId: id, before, after });
  return after;
});
```

`audit_log` is append-only in the database (UPDATE/DELETE/TRUNCATE rejected by triggers). Action names:
`<entity_snake>.<verb>`. The audit viewer (`/audit`, `audit:read`) shows every app's entries automatically.

## 5. Maker-checker

```ts
import { requestApproval, decideApproval, approvalsFor } from "@/platform/approvals";

// maker (inside mutate)
await requestApproval(ctx, { entityType: "KycCase", entityId: id, action: "kyc_case.final_decision", comment });
// checker (inside mutate) — throws 403 if the caller is the requester; DB CHECK enforces it too
const approval = await decideApproval(ctx, { approvalId, decision: "APPROVED", comment, requiredPermission: "kyc:approve" });
// then apply the entity change + audit in the same mutate callback
```

Requests and decisions are audited automatically. Store any proposed change (e.g. a flag diff) on your own
model or in the entity's audit `after`; the `Approval` row is generic (entity type/id, action, comments).

## Migrations

Each app creates its own migration: `npx prisma migrate dev --name <app>_init` (only your `<app>.prisma` changes).
**Rebase on `main` before opening the PR. If another app merged first, delete your migration folder and
regenerate it** on top of `main`, then re-run tests.

## Commands

```bash
docker compose up -d && cp .env.example .env && npm ci
npx prisma migrate deploy && npm run db:seed
npm run dev                 # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

After changing personas, run `npm run gen` and `docker compose restart mock-oidc` (it caches the login page).

## Forbidden in app PRs

- Editing `src/platform/**`, `permissions.ts`, `platform.prisma`, the shell, or another app's files
- UI-only permission checks; unwrapped route handlers/server actions; pages without `requirePermission`
- Raw Prisma client access; queries that bypass `scopedDb`/`mutate`; state changes without audit
- Real-looking personal data in seeds (use "Testy McTestface", `TEST-0000-1234`, `@example.com`)
- Secrets in the repo
- Saying "SOC 2 review" for an app; say "security review"
