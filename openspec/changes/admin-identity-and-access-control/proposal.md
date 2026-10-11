# Proposal

## Why

The application has **no identity and no authorization**: no `User` entity, no login, no session,
no role, and no database (`grep` for `req.user`, `req.auth`, `req.session`, `Bearer` and
`Authorization` across `src/`, `server.js` and `public/assets/js/` returns zero matches). All
fourteen API endpoints answer any caller. ADR-003 §9 records this as a Critical that is required
before the service is reachable beyond localhost, and it is still open.

A separate, larger proposal (`openspec/changes/saas-identity-and-tenancy/`) previously set out to
close this as part of a multi-tenant pivot shared with a second, separate "Files" portal
(`files.cloudavid.com`). That portal is not part of this repository — it is currently a static
site served by nginx directly from `/var/www/html/files-server-web`, with its own source
elsewhere, not yet inspected. The product need actually described is **not** multi-tenancy (no
tenant owns a subtree): it is one shared file pool, with an administrator controlling which files
are published, when they're available, and which specific users may download which ones. That
shape does not need a `Tenant` entity, an explicit-root `PathService` refactor, or tenant-scoped
dashboard aggregation — all of which the older proposal built around.

This change closes ADR-003's Critical and adds the administrator-vs-user distinction and the
file-publication data model the product needs, scoped entirely to this application. It does not
touch the Files portal, does not decide how (or whether) that portal will eventually consume this
data, and does not wire any enforcement of the new policies into a real download path — there is
no consumer for that yet.

## What Changes

### Identity and roles (new)

- A `User` entity with a two-value `role` (`admin` | `user`) and a `status` (`active` | `disabled`).
  There is no tenant, no membership, and no permission catalogue — a `CHECK` enum is the entire
  authorization model this application needs today.
- Server-side opaque sessions: an `HttpOnly`/`Secure` (in production)/`SameSite=Lax` cookie, with
  only a hash of the session token persisted. The same opaque token is also accepted as an
  `Authorization: Bearer` credential for programmatic/script clients.
- CSRF defense on every non-GET request, added in the same change as the session cookie.
- An origin-keyed login throttle, live from the moment the login route exists.
- A simple flat session expiry (no tiered absolute/sliding/step-up policy).
- A single bootstrap-admin account, created from operator-supplied configuration at first boot —
  without one, nobody can reach the new admin UI.

### File-access policy data model (new)

- A `files` table: one row per filesystem path an administrator has set a policy on (sparse — not
  a mirror of the whole tree).
- `file_access_policies`: one row per file, carrying `access_mode` (`public` / `authenticated` /
  `restricted`), `is_published`, `is_locked`, and an optional `available_from`/`available_until`
  availability window.
- `user_file_permissions`: per-user `grant`/`deny` rows against a specific file, for the
  `restricted` access mode.
- `audit_logs`: a flat, append-only table recording administrative actions (user create/disable,
  session revoke, policy change, permission grant, login failure), with a simple fixed-window
  retention — not the class-based retention a larger compliance-driven system would need.

### Admin panel (new)

- A fifth frontend page (`public/admin.html` + `public/assets/js/admin.js`), registered in
  `router.js`'s `PAGES`/`MODULES` maps alongside the existing four shells, following the same
  no-build IIFE/`init()`/`destroy()` convention.
- User management: create, disable, delete, reset password, revoke sessions, search/list.
- File-policy management: publish/unpublish, lock/unlock, set access mode and availability window,
  grant/revoke a specific user's permission.
- A new admin API surface (`src/routes/admin.routes.js` or split `users.routes.js` +
  `files-policy.routes.js`, mounted inside the existing single `src/routes/api.js` assembly, served
  identically at `/api/v1` and `/api`), with new named methods on `window.API`
  (`public/assets/js/api.js`) — no ad hoc `fetch` calls from the new page module.

### Persistence (new, additive)

- `node:sqlite` (stdlib, no new npm dependency) backs the tables above, behind a repository layer
  so controllers/services never see SQL. A versioned, idempotent schema step is wired into
  `scripts/deploy.sh`, following the same mechanic the superseded proposal designed (engine choice
  aside, that mechanic is not tenancy-specific).
- `data/metadata.json` and `data/settings.json` are **not** touched, migrated, or absorbed by this
  change. They remain owned by `MetadataService` and `SettingsService` exactly as today.

## Capabilities

### New Capabilities

- `identity/authentication`: sessions, bearer-token acceptance, CSRF defense, login throttle,
  logout, bootstrap admin.
- `identity/rbac-lite`: the two-value `role` column and the route-layer check that gates
  admin-only endpoints; explicitly not a permission catalogue.
- `authorization/file-access-policy`: the `files` / `file_access_policies` /
  `user_file_permissions` model and the admin CRUD surface over it. Explicitly does not include
  enforcement against a real download — there is no consumer yet.
- `persistence/admin-database`: the `node:sqlite` substrate, repository boundary, and deployment
  schema step for the tables this change introduces.
- `audit/admin-audit-log`: the flat `audit_logs` table and what it records.

### Modified Capabilities

- None. `filesystem-security`, `filesystem-aggregation`, `storage-semantics`, `dashboard-metadata`,
  `dashboard-api`, `dashboard-health`, and `cross-platform-contract` are explicitly **not**
  modified by this change — those modifications in the superseded proposal existed only to
  tenant-scope aggregation, which does not apply here. `MetadataService` and `SettingsService` are
  untouched.

## Impact

**Code.** `server.js` gains no new middleware ordering beyond what the retained
`src/routes/api.js` assembly already does (health first, then the new `authenticate` middleware,
then the existing routers plus the new admin router). `src/routes/api.js` is the single place
`authenticate` is applied, securing `/api/v1` and `/api` identically. New: `src/middlewares/
authenticate.js`, `src/middlewares/csrf.js`, `src/services/UserService.js`,
`src/services/SessionService.js`, `src/services/FileAccessPolicyService.js`, `src/db/` (schema +
repository layer), `src/routes/admin.routes.js` (or the two-file split above), matching
controllers. `src/config/env.js` gains auth-DB location and bootstrap-admin configuration,
validated in `validateStartup()` the same way `STORAGE_ROOT`/`AFM_DATA_DIR` already are.

**Frontend.** A fifth page shell and its module, plus a new `public/assets/js/auth-ui.js` (or
folded into `admin.js`) for the login view; `api.js`'s response handling stops reporting `401` as
a generic network error and raises a distinct auth-required signal that routes to login and
preserves the intended destination.

**Tests.** The hardcoded four-shell literal array that several suites assert against —
`test/frontend/app.test.js`, `test/frontend/files.test.js`, `test/integration/csp.test.js`, and
twice in `test/integration/repo-guardrails.test.js` — needs the fifth shell added or those
assertions under-cover the new page. A new `test/helpers/authenticated.js` (login against a temp
database, returns a cookie-and-CSRF-aware request helper) gets wired into the suites that boot
`server.js`, additively — `MetadataService.dbPath`/`SettingsService.dbPath` redirection is
untouched, since those stores are not part of this change.

**Docs.** ADR-009 records the engine, role-model, and policy-shape decisions. `docs/CONTRACTS.md`
gains the new endpoints' envelope documentation. `docs/REPO_MAP.md` gains entries for the new
routes/services/page per its "Where to Add Things" convention.

**Explicit non-goals.** No `Tenant` entity. No permission catalogue. No directory-inherited access
policies. No migration of `metadata.json`/`settings.json`. No change to the Files portal. No
enforcement of the new policies against any real download path. No MFA/SSO/OIDC.

## Migration, Compatibility and Risk

**Migration.** Two additive, idempotent schema migrations: (1) `users`/`sessions`/`audit_logs`,
(2) `files`/`file_access_policies`/`user_file_permissions` — migration 2 depends only on
migration 1's `users.id` existing for its nullable FK/audit columns, so the two can be built in
parallel once migration 1 lands. Authentication is built directly against migration 1's real
tables rather than against a mock, avoiding the churn of building against a schema that will be
replaced.

**Compatibility.** Every existing endpoint becomes authenticated once `authenticate` is applied in
`src/routes/api.js` — a breaking change for any unauthenticated client, accepted deliberately per
ADR-003's existing direction. `/api` remains a supported alias, secured identically to `/api/v1`.
Response shapes for existing endpoints are otherwise unchanged.

**Risks.** (1) A fifth frontend page changes the "four shells, byte-identical sidebar" invariant
several tests pin — mitigated by updating those literal arrays in the same change, not after.
(2) Bootstrapping the first admin account incorrectly (e.g., a default/predictable credential)
would undermine the entire change — mitigated by requiring operator-supplied bootstrap
configuration, never a hardcoded default, and never printing a credential to stdout. (3) Building
the `files`/`file_access_policies` data model with no real enforcement consumer risks it going
stale or being designed wrong for whatever Files-portal integration is eventually decided —
accepted as a deliberate, scoped-down risk; the alternative (waiting for that integration decision
before building anything) blocks closing ADR-003's Critical on an unrelated, unscheduled decision.
