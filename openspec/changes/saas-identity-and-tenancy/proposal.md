# Proposal

> **Scope note (narrowed, not withdrawn).** Implementation of this change has not started. The
> identity/authentication/persistence work below is being pursued first in a smaller, admin-only
> shape — see `openspec/changes/admin-identity-and-access-control/` — because the data model the
> product actually needs (one shared file pool with per-file publication policy and per-user
> grants, tracked in `Users`/`Sessions`/`Files`/`FileAccessPolicies`/`UserFilePermissions`/
> `AuditLogs`) does not match this proposal's multi-**tenant** shape (a `Tenant` entity owning a
> subtree). The `identity/tenancy` capability, the explicit-root `PathService` refactor, the
> tenant-scoped modifications to the dashboard/filesystem capabilities, and the nginx
> proxy-bypass-removal group below are deferred pending a decision — not yet made — on whether and
> how the separate Files portal (`files.cloudavid.com`, static today) will consume this app's
> identity and policy data. The `persistence/database` and `identity/authentication` decisions
> below are reused largely as-is by the admin-only change; everything else here stays a recorded,
> unimplemented proposal rather than current direction.

## Why

The application has **no identity, no authorization, and no tenant boundary**. There is no
`User` entity, no login, no session, no role, and no database: `grep` for `req.user`,
`req.auth`, `req.session`, `req.tenant`, `req.principal`, `Bearer` and `Authorization` across
`src/`, `server.js` and `public/assets/js/` returns zero matches. All fourteen API endpoints —
including upload, rename, delete and `PUT /api/settings` — answer **any** caller. The only gate
in the entire system is nginx `auth_basic` against an htpasswd file
(`scripts/nginx/cloudavid.conf:288-289`), whose own comment reads *"auth_basic below is the ONLY
gate. Do not remove it until real authentication lands in the app."* ADR-003 §9 records this as a
Critical that is **required before the service is reachable beyond localhost**, and it is still
open.

Concurrently, the product is moving from a single-operator self-hosted tool to a **multi-tenant
file portal with two surfaces — Admin Web and Files Web — that must share one identity system**.
That target cannot be reached by retrofitting authentication onto a design whose entire
persistence layer is two JSON documents keyed by filesystem path, and whose one security
boundary (`PathService`) is hardwired to a single global `STORAGE_ROOT`.

Two further facts make this the moment to decide rather than iterate:

- **A second surface bypasses the application entirely.** `files.cloudavid.com` serves
  `location ^~ /download/` and `^~ /files/` **straight from nginx**, with no application
  involvement and `auth_basic` declared only in the `admin.` vhost. Application-level identity
  cannot protect bytes that never pass through the application.
- **ADR-001 and ADR-006 both explicitly rejected a database** and both instruct supersession over
  silent divergence. Introducing one without recording the supersession leaves the repository's
  decision record actively wrong.

## What Changes

### Identity and tenancy (new)

- **BREAKING** A `Tenant` entity becomes the primary security boundary for tenant-owned data.
- **BREAKING** Tenant context is derived **only** from the authenticated session. No controller,
  service or route may read a tenant identifier from a request body, query parameter or
  header-derived value.
- **BREAKING** Every filesystem-backed endpoint becomes authenticated and tenant-scoped. All
  fourteen currently-public endpoints change access posture.
- One `User` entity, shared by Admin Web and Files Web, with tenancy expressed through a
  `Membership` relationship. There is no separate admin user store and no synchronization
  between surfaces.
- The tenant root reaches path resolution as an **explicit argument** at all eighteen call sites —
  never as module-level state, and never through request-scoped ambient context.

### Authentication (new)

- Server-side sessions as the primary browser mechanism: an opaque high-entropy token delivered
  in an `HttpOnly; Secure; SameSite=Lax` cookie, with **only a hash** persisted server-side.
- The same opaque token accepted as a bearer credential for programmatic clients, so cookies and
  API clients share one identity system rather than two.
- Session expiry, explicit revocation, and logout as a single indexed write.
- **JWT is explicitly not adopted** as the primary mechanism.
- **CSRF defence** becomes mandatory and is added in the same change as the cookie.

### Authorization (new)

- A permission catalogue with roles, role-permission grants, and user-role grants **scoped** as
  `platform` or `tenant`. There is no `User.role` column.
- **Resource-level access policies** evaluated against the resolved resource, with directory
  inheritance and time-bounded validity (`validFrom` / `validTo`).
- A `Resource` model covering the tenant root and directories — **not** one row per physical file.
  Files stay on the filesystem and the filesystem remains authoritative for content.
- Authorization evaluates **fail-closed**: a denial at any applicable level withholds access, and an
  expired denial is inert rather than permissive.

### Persistence (BREAKING)

- `data/metadata.json` and `data/settings.json` are **replaced** by a database.
- SQLite via the runtime's built-in `node:sqlite`, accessed only through a repository layer whose
  interface is engine-neutral so PostgreSQL can be introduced later without rewriting business
  logic. No new runtime dependency, no native build step, no external service.
- Download counters become atomic increments rather than whole-document read-modify-write.
- Existing metadata is **not** migrated wholesale: per-user stars are meaningful, advisory
  analytics are seeded or discarded, and both decisions are documented.

### Audit logging (new)

- An append-only `AuditLog` carrying tenant, actor, action, outcome, resource, request id, and
  where appropriate IP and user agent — with an explicit never-log list and class-based
  retention.

### Operational surfaces (modified)

- Rate limiting becomes layered: origin for pre-authentication attempts (in force before the login
  route is reachable), then account, then tenant, then a global ceiling. Upload concurrency becomes
  per tenant; the free-space watermark stays a **volume-level** property, since free space belongs to
  the filesystem rather than to a tenant.
- `/api/v1/health` **stays public** — it is the deployment activation gate — and the
  authentication ordering is specified so it is reachable while nothing else is, identically under
  `/api/v1` and the `/api` alias. Parity is asserted across **every** protected route, not a sample.
- A safe-method download records no counter; counting becomes an explicit mutation, because a
  `SameSite=Lax` cookie is attached on a cross-site top-level GET and cannot be CSRF-protected there.
- CORS stays off by default; credentials become an explicit, separate opt-in that can never
  combine with a wildcard origin.
- The SPA gains a real authentication surface. A credential-required response is presented as such —
  never as a generic network error — and routes to a login view that preserves the intended
  destination.

### Deployment

- `scripts/nginx/cloudavid.conf`: the three content-serving locations (`/download/`, `/files/` and
  `/__list/`, which lists `/var/www/html`) are **retired**, and `auth_basic` is removed **last**,
  only after runtime verification that the application is enforcing. This nginx change is
  **specified here and not implemented by this change's application work**.
- `scripts/deploy.sh` gains an idempotent schema step wired into its sequence, and its
  store-presence guard is retargeted at the database, preserving its anti-data-loss intent.

## Capabilities

### New Capabilities

- `identity/authentication`: server-side sessions, opaque credentials, CSRF defence, logout,
  expiry and revocation; the one identity system shared by both web surfaces.
- `identity/tenancy`: the `Tenant` entity, session-derived tenant context, tenant switching, and
  the prohibition on client-supplied tenant selection.
- `identity/rbac`: the permission catalogue, roles, scoped role bindings, permission enforcement at
  the route layer, and the rule that platform scope administers tenants without reading their
  content.
- `authorization/resource-access`: directory-scoped `Resource` records, inherited access policies,
  time-bounded policy validity, fail-closed policy precedence, batched per-listing authorization,
  reconciliation of vanished records, deterministic stale-mark behaviour, and per-resource
  authorization before filesystem access.
- `persistence/database`: the database substrate, repository boundary, engine portability,
  transactional integrity, tenant-scoped query discipline, the single-reversible-step cut-over, and
  the schema step's place in the deployment sequence.
- `audit/audit-logging`: what is recorded, what must never be, and how records are retained.
- `security/request-governance`: the public liveness endpoint, alias parity, cross-origin posture,
  layered throttling, minimal disclosure, authorized downloads, and the retirement of every
  unauthenticated surface that would otherwise serve tenant content.

### Modified Capabilities

- `filesystem-security`: containment is now evaluated against the **authenticated tenant's**
  root rather than one global root, and cross-tenant resolution is indistinguishable from a
  missing path rather than reporting a distinct forbidden status.
- `filesystem-aggregation`: the aggregation scope becomes the tenant's subtree, and a platform-wide
  view explicitly aggregates tenant roots rather than double-counting them.
- `storage-semantics`: volume capacity is read for the volume containing the **tenant's** root, and
  the previous requirement's single global root is replaced accordingly.
- `dashboard-metadata`: the metadata store is replaced by database-backed repositories; the
  activity shape and server-side download ranking are preserved because two page modules consume
  them, while lazy JSON bootstrap no longer applies.
- `dashboard-api`: the summary becomes tenant-scoped and requires authentication, and no
  aggregation entry point is permitted to pass a global root.
- `dashboard-health`: the health panel reports metrics for the authenticated tenant's context
  where meaningful, and platform-only metrics are labelled as such.
- `cross-platform-contract`: the tenant directory naming rule must hold on every host, and the
  SQLite file's location and permissions must respect the hardened unit.

## Impact

**Code.** `server.js` gains middleware ordering (health-first, then authenticate, then tenant
context, then authorization). `src/routes/api.js` becomes the single place authentication is
applied, so both prefixes are secured identically. `src/routes/fs.routes.js` (10 routes),
`dashboard.routes.js` (2) and `settings.routes.js` (2) gain per-route permission requirements.
`src/services/PathService.js` takes the authorized root as an explicit argument in all three methods,
and **all eighteen call sites** across `FileSystemService`, `UploadService` and `PreviewService` are
updated — including the two root-deletion guards and the per-entry loop inside the bounded tree
walk. `src/services/MetadataService.js` and `SettingsService.js` are replaced by repositories
preserving their public method signatures so controllers change minimally. `src/controllers/`
gain an authorization seam before destructive and expensive work. `src/config/env.js` gains the
database location and bootstrap/bootstrap-admin configuration.

**Frontend.** All four page shells gain a login state and a tenant switcher; `public/assets/js/`
gains an auth module and stops treating `GET /health` as an identity source (it currently fetches
it and discards the result). The sidebar's `.user-name` / `.user-role` elements — permanently
empty today, because `resolveIdentityDisplay` ignores its argument and returns
`{available:false}` — finally acquire a consumer.

**Tests.** 799 tests across 17 files that boot `server.js`. Twelve files re-point
`MetadataService.dbPath` at a temp file and three also reset `SettingsService.cache`; these become
per-suite database setup, driven by a shared authenticated-request helper so that roughly 150
existing assertions do not silently become anonymous. Four behavioural contracts must be honoured
rather than deleted: the "one store read per listing, not one per entry" assertion, the "unreadable
metadata degrades to `200`" assertion, `/api/v1` ↔ `/api` byte-identical response parity, and the
exact-dependency-list guardrail. Because `node:sqlite` adds no package, that last guardrail
continues to hold.

**Docs.** ADR-001 (persistence) and ADR-006 (settings store) are superseded, not contradicted.
ADR-003 §9's open Critical is closed. ADR-007's rule that `/api` alias removal is *blocked on
authentication* is directly engaged.

**Explicit non-goals.** No public or anonymous share links — `AccessPolicy` grants to
authenticated principals only, and no unauthenticated file-read path is introduced. No
per-file `Resource` rows. No PostgreSQL. No multi-process or clustered deployment. No horizontal
scale-out. No MFA or SSO/OIDC. No change to the SPA's no-build frontend model, and no change to
the `path.posix` client-path contract.

## Migration, Compatibility and Risk

**Migration.** Staged so that every step before the persistence cut-over is revertible by
reverting a commit, and ordered so that **no step changes filesystem or store semantics before the
tenant, its directory, and its content exist**: ADRs; the database layer with **no caller**; the
deploy pipeline's schema step; the shared authenticated test harness; authentication with its own
throttle; the explicit-root `PathService` change (behaviour-neutral while callers still pass the
global root); tenant bootstrap; **the storage relocation**; the repository cut-over with the JSON
fallback retained; and only then the removal of that fallback — the single step that makes the
database authoritative. Filesystem migration is **copy → verify → switch**, never an unverified
destructive move, and it retains the original tree until sign-off.

**Compatibility.** Every protected endpoint returns `401` where it previously returned `200`, which
is breaking for any unauthenticated client — accepted deliberately, since those clients had no
authorization to preserve. `/api` remains a supported alias and is secured identically to
`/api/v1`; the parity test proves it. Response **shapes** are otherwise preserved, so the two page
modules that consume the activity feed keep working.

**Risks.** (1) A missed authorization check on one of fourteen endpoints is a tenant breakout —
mitigated by enforcing at the single `PathService` chokepoint, by a source scan that fails when any
call site lacks a tenant root, and by a mandatory cross-tenant dashboard test. (2) `node:sqlite` is
synchronous and would serialise the event loop inside the existing 16-way listing fan-out —
mitigated by batching authorization per listing and by resolving governing records with one prefix
query. (3) Three nginx locations bypass the application entirely, so application authentication
alone would leave them exposed — hence they are in scope, retired in a staged, runtime-verified
sequence. (4) Audit volume grows without retention — mitigated by class-based retention. (5) A
deploy host gains a first-ever schema step; `deploy.sh` currently has no notion of migrations, and
its store-presence guard must be retargeted without losing its anti-data-loss intent. (6) The
storage relocation touches the operator's real files — mitigated by a verified backup and
copy-verify-switch. (7) The SPA currently treats any non-2xx as a network error and has no login
view, so enforcement without a frontend build would degrade every page.