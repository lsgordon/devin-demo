# Internal tools platform

The shared platform layer for the company's internal tools (the Power Apps replacement). It provides SSO,
role-based authorization, an append-only audit log, maker-checker approvals, row scoping, PII masking and an
app shell. Apps (KYC review queue, refunds dashboard, feature-flag admin, and more to come) plug in as
self-contained folders that the shell auto-discovers, so several apps can be built in parallel without
merge conflicts.

- Conventions for contributors and agents: [`AGENTS.md`](AGENTS.md)
- How to build a new app: [`docs/playbooks/new-internal-app.md`](docs/playbooks/new-internal-app.md)
- Reference app: `src/apps/example` (scoped list, masked PII, maker-checker)

## Run it

Requirements: Node 22, Docker.

```bash
cp .env.example .env              # mock values only
docker compose up -d              # Postgres :5432 + mock OIDC (Entra-shaped tokens) :8080
npm ci
npx prisma migrate deploy         # or: npm run db:migrate  (dev, creates migrations)
npm run db:seed                   # obviously fake data, auto-discovered per app
npm run dev                       # http://localhost:3000
```

`npm run db:reset` drops, re-migrates and re-seeds. After changing personas run `npm run gen` and
`docker compose restart mock-oidc` (the mock caches its login page at startup).

## Persona logins

Click **Sign in with SSO**, then click a persona on the mock IdP page. No passwords. Tokens carry `oid`, `tid`,
`preferred_username` and `roles[]`; the issuer is `http://localhost:8080/<tenant-id>/v2.0` (Entra v2 shape).

| Persona | Name | Roles |
|---|---|---|
| `kyc.analyst1`, `kyc.analyst2` | Testy McTestface, Fakey McFakeface | `kyc_analyst` |
| `kyc.approver1`, `kyc.approver2` | Approvy McApproveface, Checky McCheckface | `kyc_approver` (only role with `pii:read`) |
| `refunds.agent1`, `refunds.agent2` | Refundy McRefundface, Moneyback McTestface | `refunds_agent` |
| `refunds.approver1`, `refunds.approver2` | Payout McPayoutface, Ledger McLedgerface | `refunds_approver` |
| `flags.admin1`, `flags.admin2` | Toggly McToggleface, Switchy McSwitchface | `flags_admin` |
| `auditor1` | Audity McAuditface | `auditor` (read-only everywhere + audit log) |
| `noroles` | Nobody McNoroles | none (sees nothing) |

Personas live in `src/platform/auth/personas.ts`; `mock-oidc/login.html` is generated from it.
`/whoami` shows the current claims, roles and resulting permissions.

## Tests

```bash
npm run lint
npm run typecheck
npm test            # Vitest: authz map, masking, scoping, wrapper enforcement, no-vendor-auth check,
                    # manifests, plus DB tests (audit triggers, in-tx audit, maker-checker CHECK). Needs Postgres.
npx playwright install chromium
npm run test:e2e    # Playwright against the running stack: every persona logs in via mock OIDC, nav filtering,
                    # 403/404 semantics, audit viewer gating, audit UPDATE/DELETE/TRUNCATE rejected,
                    # PII never in HTML/RSC/API for unprivileged roles, maker-checker end to end.
```

CI (`.github/workflows/ci.yml`) runs all of the above against Postgres and the mock OIDC containers.

## Architecture

```
Browser ──► Next.js (App Router)
              middleware.ts ............ Auth.js session gate (coarse; real checks are server-side below)
              app/layout.tsx ........... shell: nav built from app manifests filtered by permission, logout
              app/(platform)/whoami .... claims + roles
              app/(platform)/audit ..... audit viewer (audit:read), filter by entity / actor / action
              app/(apps)/<app>/** ...... app pages, server actions, route handlers
                   │  every entry point: withPermission(perm, handler) / requirePermission(perm)
                   ▼
              src/apps/<app>/service.ts  business rules
                   │  reads: scopedDb(user)        writes: mutate(user, ({tx, audit}) => ...)
                   ▼
              src/platform/data ........ Prisma extension: row scope from manifest, 404 on out-of-scope,
                                         PII masked unless pii:read, one tx per mutation + mandatory audit
              src/platform/approvals ... maker-checker (requester ≠ decider: service check + DB CHECK)
              src/platform/authz ....... roles claim → permissions (permissions.ts, the only mapping)
              src/platform/auth ........ Auth.js v5, generic OIDC provider, env-only config
                   ▼
            Postgres: platform tables (audit_log with append-only triggers, approval with CHECK)
                      + one prisma/schema/<app>.prisma per app, one migration per app

IdP: mock-oauth2-server locally (Entra-shaped) │ Microsoft Entra ID in prod — same code, env vars differ
```

Conflict-free app layout: an app owns `src/apps/<app>/`, `src/app/(apps)/<app>/`, `prisma/schema/<app>.prisma`,
its migration, and `e2e/<app>.authz.spec.ts`. Nav registry and seeds are auto-discovered (the generated registry
is gitignored). Permissions for kyc/refunds/flags are pre-declared, so no app needs to edit `permissions.ts`.

## Entra setup

The code has no Entra-specific paths (`tests/unit/no-vendor-auth.test.ts` enforces this). Switching is env-only.

1. **App registration**: Entra admin center → App registrations → New registration. Single tenant.
   Platform: Web. Redirect URI: `https://<your-host>/api/auth/callback/oidc`
   (local: `http://localhost:3000/api/auth/callback/oidc`).
2. **Client secret**: Certificates & secrets → New client secret. Store it in your secrets manager.
3. **App roles**: App roles → Create app role, allowed member type *Users/Groups*, one per role, with
   **value = role name** exactly: `kyc_analyst`, `kyc_approver`, `refunds_agent`, `refunds_approver`,
   `flags_admin`, `auditor`. Entra emits assigned roles in the ID token's `roles` claim.
4. **Assign users/groups**: Enterprise applications → (the app) → Users and groups → Add assignment → pick a
   user or group and a role. Prefer groups. Set *Assignment required* = Yes so unassigned users can't sign in.
5. **Token claims**: `oid`, `tid`, `preferred_username` and `roles` are in the v2 ID token by default with the
   `openid profile email` scopes the app requests. No optional claims needed.
6. **Env vars** (only these change):

```bash
AUTH_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
AUTH_OIDC_CLIENT_ID=<application (client) id>
AUTH_OIDC_CLIENT_SECRET=<client secret>
AUTH_SECRET=<random 32+ bytes, e.g. `openssl rand -base64 32`>
AUTH_URL=https://<your-host>
DATABASE_URL=postgresql://...
```

The app refuses to start if any auth variable is missing (`src/instrumentation.ts`).

## Gaps to production

Not built here (out of scope or time-boxed). Each needs an owner before real data goes in.

**Infrastructure and operations**
- Real hosting/deploy (none here), environment promotion, infrastructure as code
- Secrets management (vault / cloud secrets manager); rotation of `AUTH_SECRET` and the OIDC client secret
- Network isolation: private DB, no public IdP-to-app shortcuts, egress controls, WAF
- Backups, point-in-time recovery, DR plan and restore drills
- Observability: structured logs, metrics, tracing, alerting; error tracking
- Dependency/patch ownership (Renovate/Dependabot, Next.js and Auth.js beta upgrades) and an on-call owner
- Auth.js v5 is still beta (`next-auth@5.0.0-beta`); pin and track to GA

**Security**
- A security review of the shared layer (authz wrapper, scoping extension, masking, approvals) before the first app ships
- Rate limiting, CSP and security headers (HSTS, frame-ancestors, etc.), CSRF review for route handlers
- Session hardening: short session lifetime, idle timeout, refresh of role changes (roles are read at login
  and live until the session expires), back-channel logout
- Least-privilege DB roles: app user without DDL; separate migration user; audit table owned by a role the app
  can only INSERT into (today the trigger blocks UPDATE/DELETE, but a superuser can still drop the trigger)
- PII at rest: column encryption / tokenization for national IDs, DOBs, card data; data retention rules
- Audit snapshots: `before/after` captured through the scoped client are masked for actors without `pii:read`
  and raw for actors with it; decide the policy (e.g. always mask or hash PII in audit)
- Unmask-on-demand with reason + audit (today it's all-or-nothing via `pii:read`)

**Compliance and governance**
- Audit log retention, export to a SIEM, tamper evidence (hash chain / WORM storage)
- Periodic access reviews of Entra role assignments; joiner/mover/leaver process
- Break-glass access procedure
- Data classification per app field (the manifest `pii` list is the start)

**Product / platform**
- Real connectors to source systems (core banking, payments, flag service). Apps use local tables only
- Notifications for pending approvals; approval expiry/SLA; multi-level or N-of-M approvals
- Pagination and search helpers for large lists; the audit viewer shows the latest 200 rows only
- Per-environment config for the feature-flag app (real flag backend)
- Accessibility pass and a design system; the shell is deliberately plain

**Unfinished from this session**
- SQLite fallback and its append-only trigger equivalent are not implemented (Postgres only via docker compose)
- Devin Knowledge entries and the Devin-side `new-internal-app` skill need to be created/approved in the
  Devin org (the conventions are committed in `AGENTS.md` and `docs/playbooks/new-internal-app.md`)
- Playwright e2e tests share one database and run serially; per-test DB isolation would make them faster
