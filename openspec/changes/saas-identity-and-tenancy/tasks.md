# Tasks

**Ordering is authoritative and matches the Migration Steps table in `design.md`.** The invariant:
*no step changes filesystem or store semantics before the tenant, its directory, and its content
exist.* Groups 1–10 are revertible by reverting a commit; **group 7 task 7.11 is the point of no
return**; group 8 enforces; group 9 removes the proxy bypasses; group 10 closes.

Every task states its own verification. Each group lands the tests and documentation its own work
calls for.

## 1. Decision records and contracts

- [ ] 1.1 Write ADR-009 (identity and tenancy — supersedes ADR-001 §2's persistence sentences),
  ADR-010 (session-based authentication, CSRF, health-stays-public), ADR-011 (database replaces the
  JSON stores — supersedes ADR-001 and ADR-006), ADR-012 (authorization is directory-resource
  scoped), ADR-013 (the `/api` alias is retained but secured), and ADR-014 (cross-tenant
  impersonation explicitly excluded). Each carries the required supersession line (verify: the six
  files exist under `docs/decisions/`, each names what it supersedes or extends, and no accepted ADR
  is edited in place).
- [ ] 1.2 Update `docs/CONTRACTS.md` with the endpoint classification table (public /
  authenticated / tenant-scoped), the atomic batch rule, and the 404-parity semantics (verify: the
  table lists all fourteen existing routes plus the `/auth/*` routes with each route's access
  posture).
- [ ] 1.3 Update `docs/DEPLOYMENT.md`: the database file and its `-wal`/`-shm` sidecars live in
  `AFM_DATA_DIR` and are covered by the same writable path; the schema step runs between install
  and the release suite; the store-presence guard now targets the database file; the
  copy-verify-switch relocation procedure; and the operator confirmation that discarding
  `starred`/`downloads`/`activities` is acceptable (verify: each of the five is present in
  DEPLOYMENT.md).
- [ ] 1.4 Record the four nginx bypass locations (`/download/`, `/files/`, `/__list/`, and
  `auth_basic`) in `scripts/nginx/README.md` as the retired set, with the evidence that
  `/var/www/html/{download,files}` are **not** `STORAGE_ROOT` and the four-stage removal order
  (verify: the README states the directories are siblings, not tenant storage, and names the
  staged order).

## 2. Database substrate, schema step, and test harness

- [ ] 2.1 Create `src/db/` with a repository port (`TenantStore`, `UserStore`, `MembershipStore`,
  `SessionStore`, `RoleStore`, `RolePermissionStore`, `UserRoleStore`, `ResourceStore`,
  `PolicyStore`, `StarStore`, `CountStore`, `SettingsStore`, `AuditStore`) exposing named
  operations in application terms, backed by `node:sqlite`, with **no engine-specific type in any
  signature** (verify: importing the module and enumerating its exports shows only
  application-named methods; no method returns `StatementSync`/`DatabaseSync`).
- [ ] 2.2 Create the schema per `design.md`'s Entity Reference: all fourteen tables with
  `tenant_id NOT NULL` on **every** tenant-owned table **including `AccessPolicy`**, `PRIMARY KEY`
  and FK declarations, `CHECK` on `UserRole.scope` and `AccessPolicy.effect` /
  `AccessPolicy.principal_type`, and the `UNIQUE (tenant_id, natural_key)` constraints. Record in
  a comment beside `AccessPolicy.principal_id` that it is polymorphic and therefore carries **no
  foreign key**, with the tenant-scoped join named as the compensating control (verify: `PRAGMA
  table_list` returns exactly these tables; `PRAGMA foreign_key_list(AccessPolicy)` shows the
  `tenant_id` and `resource_id` keys and confirms `principal_id` has none).
- [ ] 2.3 Add `Resource`'s unique `(tenant_id, client_path)` as the governing-lookup index and
  **do not** add a `parent_id` index; record the prefix-query strategy in a comment (verify:
  `PRAGMA index_list(Resource)` shows the unique index; a source comment states the
  `ORDER BY length(client_path) DESC LIMIT 1` strategy).
- [ ] 2.4 Add the schema-advancement runner: a `schema_migrations` ledger, outstanding versions
  applied in order, each recorded; re-running against a current database is a no-op; **a stored
  schema newer than the code understands is refused** (verify: run twice → second reports "already
  current" and changes nothing; a hand-inserted future version is refused with a non-zero exit).
- [ ] 2.5 **Wire the schema runner into `scripts/deploy.sh` as its own numbered stage**, between
  `npm ci --omit=dev` (line 244) and the in-release suite gate (lines 257-260), so a release that
  cannot advance the schema never activates (verify: the deploy log shows the schema stage running
  before the suite line; a deliberately failing runner aborts with `pre-activation-failed`).
- [ ] 2.6 Retarget the store-presence guard (`deploy.sh:236-241`) from **two** JSON filenames to
  **one** database file, preserving *"never start an empty store on a host that has run before"*
  (verify: source check that the JSON guard is gone and the database guard plus its refusal path
  remain).
- [ ] 2.7 Create `test/helpers/authenticated.js`: logs in against a temp database, returns a
  cookie-bearing request function plus helpers for building a session in a given tenant, presenting
  the CSRF header, and reading back the acting principal (verify: a scratch suite using it
  authenticates and receives `200` from `/api/v1/fs/list`).
- [ ] 2.8 **Convert all 17 suites that boot `server.js`** to the helper, replacing the
  `MetadataService.dbPath = …` / `SettingsService.dbPath = …` redirects with a temp database.
  Enumerated: `api/cors.contract`, `api/cors.enabled`, `api/dashboard.contract`, `api/fs.contract`,
  `api/fs.symlink`, `api/header-hygiene`, `api/rate-limit`, `api/settings.contract`,
  `api/trust-proxy`, `api/upload.governance`, `api/upload.surface`, `api/versioning.contract`,
  `integration/live-server`, and the remainder that boot the server (verify: `grep -rn "dbPath =
  " test/` returns nothing and `npm test` passes with the same assertion count as before the
  conversion).

## 3. Authentication, with its throttle in the same group

- [ ] 3.1 Create failing tests in `test/api/auth.contract.test.js` for: valid login creates a
  session and sets the cookie; invalid password returns the same status and body as no-such-account;
  repeated failures lock the account without disclosing the counter; logout revokes only the
  presented session; expired and revoked sessions are 401; `GET /auth/me` returns the principal and
  effective permissions; **the login route is throttled by origin from the moment it is reachable**;
  a store-read failure refuses rather than admitting (verify: suite red against current code).
- [ ] 3.2 Implement `UserStore`, `SessionStore`, `RoleStore`, `RolePermissionStore`,
  `UserRoleStore` and the login/logout/me handlers against the repository port, storing only
  hashes for passwords and session tokens, and issuing the cookie `HttpOnly`, `Secure` in
  production, `SameSite=Lax` (verify: 3.1 green; source check that no plaintext secret and no
  recoverable token is persisted).
- [ ] 3.3 **Implement the origin-keyed login throttle in this same group**, before the login route
  is exposed — key on the attempt's origin, never on the submitted account name (verify: a burst of
  login attempts from one origin is eventually 429; the throttle key does not include the submitted
  account, so failures against another account cannot lock it out).
- [ ] 3.4 Add the CSRF middleware: a session-bound token issued at login, required as a header on
  every non-GET, compared against a stored hash; a header-less non-GET is 403 before any mutation;
  another session's token is 403 (verify: CSRF scenarios green).
- [ ] 3.5 Implement expiry, revocation and **per-request membership evaluation** inside
  `authenticate()`, so deactivating a membership takes effect at once and a store failure **fails
  closed** (verify: expired, revoked and deactivated-membership scenarios pass; a store failure
  yields 401, not an anonymous 200).
- [ ] 3.6 Implement `POST /auth/switch-tenant`: verify the membership, revoke the current session,
  issue a fresh session bound to the requested tenant. Switching to a non-member tenant is refused
  **with no disclosure of whether it exists** (verify: switch succeeds for a member, is refused for
  a non-member with an identical body to a nonexistent tenant, and the superseded credential no
  longer addresses the previous tenant).
- [ ] 3.7 Encode the session lifetime policy from D17 — 8-hour absolute, 30-day sliding renewal,
  re-authentication for destructive operations past a stated age (verify: a session older than 8
  hours is refused; active use renews it; a destructive operation past the re-auth age is refused
  while a read is not).

## 4. Tenant context, the explicit-root chokepoint, and storage preparation

- [ ] 4.1 Create failing tests in `test/api/tenancy.contract.test.js` for: the tenant is resolved
  from the session alone; a contradictory client-supplied tenant value is refused; a client path
  escaping the tenant root is 404; traversal into a sibling tenant is 404; a host-hint mismatch is
  403; and **the 18-call-site inventory in D13 is complete** — assert by source scan that no
  `PathService` call site lacks a root argument (verify: suite red).
- [ ] 4.2 Add dedicated **`toClientPath`** tests: round-trips against a tenant root; returns `/` for
  a path outside the root; uses the **same** root as the forward conversion so a client path minted
  under one tenant re-resolves under that tenant and not another (verify: new tests pass against the
  current implementation, then against the parameterised one).
- [ ] 4.3 Add dedicated **tenant-root containment** tests porting every existing traversal case
  (separator boundary, single resolution basis, root spelling variants, POSIX-shaped root,
  name-prefix sibling, nested sibling, root itself, direct/nested children) so the root under test
  is a tenant root rather than the global one (verify: the ported cases pass for both roots).
- [ ] 4.4 Change **all three** `PathService` methods to take the root as an explicit argument —
  `resolveSecurePath(clientPath, root)`, `resolveSecureRealPath(clientPath, root)`,
  `toClientPath(absolutePath, root)` — removing the internal `config.storageRoot` reads at
  `PathService.js:23`, `:64`, `:102`. **No module-level tenant state, no `AsyncLocalStorage`** (D13)
  (verify: `grep` shows no `config.storageRoot` inside `PathService.js`; 4.2 and 4.3 pass).
- [ ] 4.5 Update **every call site in the D13 inventory** to pass a root, including the two
  root-deletion guards (`rename:145`, `remove:184` — which must compare against the *tenant* root),
  the `getTreeStats` walk (`:262`, `:286`) and **its per-entry loop (`:345`)**, `getVolumeStats`
  (`:433`), `retainExisting` (`:518`), `PreviewService:67`, `UploadService:125/:142/:157`, and the
  three `toClientPath` calls (`rename:162-163`, `UploadService:142`). While this change is in
  flight, existing callers pass the global root, so behaviour is unchanged (verify: 4.1's source
  scan is green and the existing suites still pass).
- [ ] 4.6 Fix the dashboard's hardcoded `'/'`: `dashboard.controller.js:123-124` must pass the
  authenticated tenant's root to `getTreeStats` and `getVolumeStats` rather than the literal, and
  `getList`'s recursive folder sizing must pass the same root (verify: source check that no
  filesystem aggregation call in `src/controllers/` passes a literal `'/'`).
- [ ] 4.7 **Add the mandatory cross-tenant regression test**: tenant A has 10 files, tenant B has
  100; A's dashboard reports 10 files and B's reports 100; neither summary contains the other's
  bytes; and `getTreeStats` never reads a path outside the acting tenant's root (verify: the test
  fails against 4.6-before and passes after).
- [ ] 4.8 Implement `establishTenant()` and thread `req.auth` / `req.tenant` through `apiRoutes`
  before the resource routers, inside the one assembled router serving both prefixes; the optional
  host hint is verified against the session and can only narrow (verify: the middleware-ordering
  assertion — health reachable, everything else authenticated, both prefixes identical — passes).
- [ ] 4.9 Implement tenant directory naming per the resolved decision: the `slug` is stored as the
  exact directory name, **lowercase-normalised at creation**, validated with the existing
  `validateFileName`, and **rejected on collision** — never silently disambiguated (verify: a
  reserved name, a separator-containing name and a duplicate slug are each refused at creation).
- [ ] 4.10 Add the first-tenant bootstrap: one `Tenant`, its directory, its root `Resource`, one
  `User`, an active `Membership`, and a platform-scoped binding per D16. It is **idempotent**,
  takes the credential from an operator-provided file or an interactive prompt (**never printed to
  stdout**, which the unit sends to the journal), and consults no JSON store (verify: running it
  twice creates no duplicate tenant or account; a second run is a no-op).
- [ ] 4.11 **Relocate `STORAGE_ROOT` → `STORAGE_ROOT/<slug>/` by copy → verify → switch.** Preflight
  is blocking: back up `STORAGE_ROOT` **and** `AFM_DATA_DIR`; **verify the backup by restoring it**
  and comparing counts; record a manifest (file count, total bytes, checksum list); rehearse against
  a copy. Execution: create the empty destination, **copy** (never move), compare manifests, **abort
  on mismatch with the original untouched**, switch on match, and **retain the original tree** until
  sign-off. Document half-failure detection (manifest comparison) and recovery (delete the
  incomplete destination, re-run) (verify: the procedure runs end to end on a synthetic tree; an
  injected mid-copy failure leaves the source complete and the destination removable).

## 5. Cut-over to database authority, in two reversible steps

- [ ] 5.1 Point `MetadataService` and `SettingsService` at the repositories — public method
  signatures unchanged so controllers keep compiling — **while retaining the JSON store as a
  documented fallback**. Define the degraded mode precisely: an unreadable database degrades the way
  `dashboard.controller` already degrades (omit that contribution), and stale JSON is **never**
  presented as current. No dual-write: the database is authoritative for writes from this step on
  (verify: existing service suites pass; a forced database failure degrades rather than serving
  stale data).
- [ ] 5.2 Change the counter, star and activity writes to the database's atomic forms
  (`count = count + 1`, single-row insert/delete, single-row transaction) (verify: a concurrency
  test shows N concurrent increments land as N, which the JSON read-modify-write could not do).
- [ ] 5.3 Switch `dashboard.controller`'s `getActivities` / `getTopDownloads` / `retainExisting` and
  the `uploads.js` recent-uploads consumer to the repositories, **preserving the `{type, target,
  folder, time}` activity shape** the page modules parse (verify: the dashboard summary and the
  uploads panel return the same observable shape; `test/frontend/uploads.test.js` passes unchanged).
- [ ] 5.4 Implement batched authorization per D14: for a listing, resolve every ancestor prefix in
  **one** prefix query and every applicable policy in **one** query, then decide each entry in
  memory. The query count must not scale with the entry count, and the batch must be pinned to the
  acting tenant (verify: a listing of 205 entries issues a bounded number of policy queries — reuse
  the existing "one store read, not one per entry" assertion shape; a cross-tenant entry in the batch
  is still individually refused).
- [ ] 5.5 Implement the reconciliation pass per D19: idempotent, bounded per invocation,
  non-blocking, tenant-scoped, logging the tenant and count removed (including a "nothing to
  remove" case), safe against a directory vanishing mid-pass (verify: a seeded orphan row is removed
  and a live row survives; a second run removes nothing; a tenant-A pass does not touch tenant B).
- [ ] 5.6 Add a preflight assertion to the release suite that the stored schema version matches what
  the code expects, so the in-release gate fails before activation rather than after (verify: a
  deliberately mismatched schema fails `npm test` inside the release).

## 6. Frontend authentication (the SPA is a build, not a patch)

- [ ] 6.1 Create an authentication module owning sign-in/sign-out state, the current principal and
  the acting tenant, exposed for the page modules (verify: unit tests for its state transitions).
- [ ] 6.2 Create the login shell, reachable without a session and loaded before the protected pages
  (verify: it renders standalone; its scripts parse, asserted by the existing script-parse check).
- [ ] 6.3 **Change `api.js` so a `401` is never surfaced as `Toast.error('Network Error', …)`** —
  raise a distinct auth-required signal instead, and keep the status on the error for callers
  (verify: a unit test asserting a 401 produces the auth signal and no network-error toast).
- [ ] 6.4 Route to the login view on auth-required and **preserve the intended destination** across
  authentication (verify: a deep link to a protected view, after signing in, lands on that view).
- [ ] 6.5 Add the tenant switcher: issues `/auth/switch-tenant`, re-enters the acting tenant on
  success, refreshes the view, and refuses without disclosing tenant existence (verify: switching
  succeeds for a member tenant and the refusal body is indistinguishable from a nonexistent one).
- [ ] 6.6 Give the sidebar identity region a real consumer — `.user-avatar` / `.user-name` /
  `.user-role` — and make `resolveIdentityDisplay` (`app.js:959-966`) use its argument instead of
  returning `{available:false}` unconditionally; render nothing fabricated for an anonymous caller
  (verify: a signed-in caller's name and tenant role appear on all four shells; the sidebar
  byte-identity test stays green).
- [ ] 6.7 Update `files.js` for the atomic batch semantics: a denial refuses the whole batch rather
  than appearing per-path in `data.failed`, and the toast must not report a count of paths sent
  (verify: a mixed-permission batch shows one truthful message; existing files tests updated
  accordingly).
- [ ] 6.8 Verify `router.js` teardown/init remain sound across the auth state change, and that no
  page module assumes an authenticated context it cannot verify (verify: navigation suite green;
  navigation between pages while signed out does not leak protected content).

## 7. Enforcement — the point of no return

- [ ] 7.1 **Remove the JSON fallback** from `MetadataService` and `SettingsService`, and delete the
  lazy-bootstrap logic. **This is the single step that makes the database authoritative and the
   previous stores stale — the point of no return.** Confirm with the operator that discarding
  `starred` / `downloads` / `activities` is acceptable before running it (verify: `grep` finds no
  `metadata.json` / `settings.json` reference in `src/`; the entire suite passes).
- [ ] 7.2 **Flip every remaining caller to pass the tenant root** — all 18 sites from D13 now receive
  `req.tenant.root` instead of the global root (verify: source scan shows no `PathService` call
  site passing a global/config root; 4.3's tenant-root traversal tests pass).
- [ ] 7.3 Enforce `requirePermission` on every protected route using the classification table, with
  the ordering requirement that authorization runs inside the assembled router. Permissions per
  D16 — including **no `fs.read` at platform scope** (verify: a request without the required
  permission is 403; without a session is 401; a platform administrator requesting another tenant's
  file gets 404, not 200).
- [ ] 7.4 Add the atomic batch rule to `DELETE /fs/delete`, `PUT /fs/rename`,
  `POST /fs/download-zip` and `POST /fs/upload`: validate all, authorize all, then mutate; a
  cross-tenant member is a 404 indistinguishable from missing (verify: a batch with one cross-tenant
  member is refused wholesale and no member is deleted; a batch with one invalid member is 400 and
  nothing is touched).
- [ ] 7.5 Make upload concurrency per tenant — `Map<tenantId, count>` — while the free-space
  watermark stays volume-level (`fsp.statfs` on the tenant's root), per D20 (verify: one tenant
  exhausting its concurrency limit does not affect another's; the free-space refusal still precedes
  any byte being staged).
- [ ] 7.6 Wire audit writes into every mutating request inside its transaction, with the never-log
  list enforced by construction (verify: a mutation produces a row; a denial produces a row; the
  stored columns cannot hold a token, hash, cookie or password).
- [ ] 7.7 Remove the download counter from the safe-method path: `GET /fs/download` performs no
  stored write, and counting moves to an explicit mutation (D18) (verify: a download leaves the
  counter unchanged; the explicit mutation increments it and requires the CSRF header).

## 8. Governance, parity and health

- [ ] 8.1 Extend the layered rate limiter: account- and tenant-keyed for authenticated traffic, a
  stricter tier for administrative and destructive endpoints, a per-tenant bound for uploads and
  expensive operations, and a process-wide ceiling (verify: the existing rate-limit suite passes
  with the new keying; a per-tenant burst does not exhaust another's allowance).
- [ ] 8.2 Extend `test/api/versioning.contract.test.js` to assert **every protected route** returns
  the same status and shape through `/api/v1` and `/api`, for authenticated, unauthorized **and**
  anonymous callers — not just `/health` (verify: the parity assertion covers all fourteen routes;
  removing a middleware from one prefix fails the suite).
- [ ] 8.3 Assert the liveness endpoint stays public and returns only its declared fields, and that a
  case-varied or unknown version segment reaches no protected handler (verify: a `/api/V1/fs/list`
  request does not execute a protected handler).
- [ ] 8.4 CORS tightening: off by default; configured list when enabled; credentials a separate
  explicit switch; wildcard refused whenever credentials are permitted and always in production
  (verify: with no env set no CORS header is emitted; a wildcard-with-credentials configuration fails
  startup in production).

## 9. Proxy bypass removal — staged, runtime-verified

Each stage is a separate change to `scripts/nginx/cloudavid.conf` with its **own runtime
verification**. A source-level grep is explicitly not accepted.

- [ ] 9.1 Stage 1 — deploy with enforcement live; **change nothing at the proxy yet**.
  Verify at runtime: anonymous `/api/fs/list` → 401; authenticated-without-permission → 403;
  cross-tenant path → 404; a denial produced an audit row (verify: the four runtime observations
  are recorded before any proxy file is touched).
- [ ] 9.2 Stage 2 — retire `/__list/` (the widest bypass: `autoindex` over `/var/www/html`,
  `cloudavid.conf:113-136`). Verify at runtime: `GET /__list/download/` → 404 from the proxy, and
  `nginx -t` passes (verify: the runtime observation is recorded).
- [ ] 9.3 Stage 3 — retire `/download/` and `/files/` (lines 151-165), per the resolved decision
  that this content is **not** `STORAGE_ROOT` and is retired rather than proxied. Verify at runtime:
  `GET /download/<file>` → 404; an authenticated application download still serves (verify: both
  runtime observations recorded; the published-URL break is documented for the operator).
- [ ] 9.4 Stage 4 — **only then** remove `auth_basic` from the `admin.` vhost (lines 288-289).
  Verify at runtime: the admin vhost reaches the application, and an anonymous application request is
  refused **by the application** (401), not by the proxy (verify: the 401 originates from the
  application; the required ordering is recorded in the file's header comment).
- [ ] 9.5 Confirm the static portal itself (`files-server-web`, `location /`, asset cache strategy)
  is untouched and still serves — this change removes the three content locations, not the portal
  (verify: the portal's own asset and HTML locations are present and serving).

## 10. Integration verification and close-out

- [ ] 10.1 Run the full suite: zero regressions, zero unexpected skips (verify: `npm test` exits 0
  and the assertion count is not lower than before the change).
- [ ] 10.2 Manual spot-check: sign in as a tenant member and confirm that tenant's files are served;
  sign in as a second tenant and confirm the first is unreachable (404); attempt a cross-tenant path
  (404); attempt a same-tenant denial (403 with an audit row); revoke a session and confirm the next
  request is 401; switch tenants and confirm the previous credential no longer addresses the old
  tenant (verify: each observed behaviour matches the specs).
- [ ] 10.3 Deployment end to end on a host-like environment: the schema stage runs in order, an
  absent database on a host that has run before is refused, the in-release suite passes against the
  advanced schema, and activation proceeds only after health reports the expected version (verify:
  the deploy log shows the stages in order).
- [ ] 10.4 Update `docs/REPO_MAP.md` with `src/db/`, the new middleware, and the six ADRs; verify
  `docs/CONTRACTS.md` matches the enforced route table (verify: a read-through finds every new
  source file; the route tables show no drift).

**Out of scope (documented, not built):** public/share links, cross-tenant impersonation,
PostgreSQL, MFA/SSO, per-file `Resource` rows, horizontal scale-out, removal of the `/api` alias.