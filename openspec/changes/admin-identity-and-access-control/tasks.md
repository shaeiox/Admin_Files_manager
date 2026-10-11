# Tasks

**Ordering is authoritative and matches the Migration Steps table in `design.md`.** Groups 1-2 are
schema and auth, revertible by reverting a commit; group 3 bootstraps the first operator account;
group 4 (the file-policy tables) can be built in parallel with groups 2-3 once group 1 lands; group
5 (admin UI) can be split in parallel once groups 2 and 4 land. No step enforces a policy against
a real download — that is explicitly out of scope for this change (see `design.md` D5).

Every task states its own verification. Each group lands the tests and documentation its own work
calls for.

## 1. Decision records and database substrate

- [ ] 1.1 Write ADR-009 (done — `docs/decisions/ADR-009-admin-identity-and-file-access-policies.md`)
  and add the superseded-scope banner to `openspec/changes/saas-identity-and-tenancy/proposal.md`
  (done) (verify: both files exist and the banner names this change by path).
- [ ] 1.2 Create `src/db/` with a connection module and a repository layer (`UserRepository`,
  `SessionRepository`, `FileAccessPolicyRepository`, `UserFilePermissionRepository`,
  `AuditLogRepository`) exposing named operations in application terms; no `StatementSync`/
  `DatabaseSync` type crosses the boundary (verify: enumerating the module's exports shows only
  application-named methods).
- [ ] 1.3 Create schema migration 1 (`users`, `sessions`, `audit_logs`) per `design.md`'s schema,
  with a `schema_migrations` ledger that is a no-op on a second run and refuses a stored schema
  newer than the code understands (verify: run twice — second reports "already current" and
  changes nothing; a hand-inserted future version is refused with a non-zero exit).
- [ ] 1.4 Wire the schema runner into `scripts/deploy.sh` as its own stage, between `npm ci
  --omit=dev` and the in-release suite gate (verify: the deploy log shows the schema stage running
  before the suite line).
- [ ] 1.5 Extend the deploy script's store-presence guard to also check for this database file,
  without removing its existing `metadata.json`/`settings.json` checks (verify: a host missing
  either the JSON stores or the new database file is refused at activation).
- [ ] 1.6 Update `.env.example` and `docs/DEPLOYMENT.md` with the database file's location (inside
  `AFM_DATA_DIR`, alongside the JSON stores) and the bootstrap-admin configuration variables
  (verify: both files mention the new variables and the database's data-directory location).

## 2. Authentication

- [ ] 2.1 Implement `src/middlewares/authenticate.js`: reads the session cookie or `Authorization:
  Bearer`, loads the session via `SessionRepository`, rejects an expired/revoked/missing session
  with `AppError(401, ...)`, attaches `req.user` (verify: a request with no credential gets `401`;
  a request with a valid cookie reaches the next handler with `req.user` populated).
- [ ] 2.2 Implement `src/middlewares/csrf.js`: every non-GET request must present a header matching
  the session's `csrf_secret`-derived token; missing/mismatched throws `AppError(403, ...)`
  (verify: a POST with no CSRF header is refused; a POST with the correct token succeeds).
- [ ] 2.3 Implement the login-throttle middleware (origin-keyed, live from the moment the login
  route exists) reusing the existing `src/middlewares/rateLimit.js` pattern rather than a new
  mechanism (verify: repeated failed logins from one origin are throttled per the existing
  rate-limit test conventions).
- [ ] 2.4 Implement `src/services/UserService.js` (create/disable/delete/reset-password/search) and
  `src/services/SessionService.js` (login verifies hash via `node:crypto` scrypt/pbkdf2,
  logout/revoke, bulk-revoke-by-user) (verify: a correct password logs in; an incorrect password
  and a nonexistent username return the identical response).
- [ ] 2.5 Add `src/routes/auth.routes.js` (`POST /auth/login`, `POST /auth/logout`, `GET
  /auth/me`) mounted inside `src/routes/api.js`, applying `authenticate` to every other router
  mounted after it (verify: `/health` is reachable with no session; every other existing route
  returns `401` with no session).
- [ ] 2.6 Add a `role`-check helper (`requireAdmin` middleware) used only by the new admin routes
  in groups 4-5 (verify: a non-admin session gets `403` from an admin-only route; an admin session
  succeeds).
- [ ] 2.7 Create `test/helpers/authenticated.js`: logs in against a temp database, returns a
  cookie-and-CSRF-aware request function (verify: a scratch suite using it gets `200` from
  `/api/v1/fs/list`).
- [ ] 2.8 Convert the suites that boot `server.js` to also point this new database at a temp file
  and authenticate via the helper, additively alongside their existing `MetadataService.dbPath`/
  `SettingsService.dbPath` redirection (verify: `npm test` passes with every previously-passing
  assertion still passing).

## 3. Bootstrap

- [ ] 3.1 Add a bootstrap-admin creation path, driven by operator-supplied configuration validated
  in `config.validateStartup()` the same way `STORAGE_ROOT` is — never a hardcoded default, never
  printed to stdout (verify: a fresh database with the bootstrap config set creates exactly one
  admin account on first boot; a second boot does not create a duplicate).

## 4. File-access policy data model

- [ ] 4.1 Create schema migration 2 (`files`, `file_access_policies`, `user_file_permissions`) per
  `design.md`'s schema (verify: the tables exist with the documented `CHECK`/`UNIQUE`/`FOREIGN
  KEY` constraints).
- [ ] 4.2 Implement `src/services/FileAccessPolicyService.js`: create/update a file's policy
  (access mode, publish/lock flags, availability window), grant/revoke a user's permission, list
  policies (verify: setting a policy on a path creates exactly one `files` row and one
  `file_access_policies` row; setting it again on the same path updates in place rather than
  duplicating).
- [ ] 4.3 Extend `FileSystemService.rename`/`remove`'s existing fire-and-forget metadata call (the
  one already calling `MetadataService.renamePath`/`deletePath`) to also update or remove a
  matching `files` row via `FileAccessPolicyService`, without making the filesystem operation's
  success depend on it (verify: renaming a policy-governed path updates the `files.client_path`
  row; the rename still succeeds even if this update fails).
- [ ] 4.4 Add `src/routes/files-policy.routes.js` (or fold into `admin.routes.js`): `GET/PUT
  /admin/files/policy`, `POST/DELETE /admin/files/permissions`, gated by `requireAdmin` (verify:
  each route's envelope matches rule 6 — mutating returns `{success:true,...}`, listing returns
  the bare shape).

## 5. Admin panel (frontend)

- [ ] 5.1 Add `'admin.html': 'admin'` to `router.js`'s `PAGES` map and `admin: 'Admin'` to
  `MODULES`; create `public/admin.html` (sidebar byte-identical to the other four shells) and
  `public/assets/js/admin.js` with `init()`/`destroy()` (verify: navigating to the admin page via
  the router does not throw and registers `window.Admin`).
- [ ] 5.2 Update the hardcoded four-shell literal arrays to five: `test/frontend/app.test.js`,
  `test/frontend/files.test.js`, `test/integration/csp.test.js`, and both occurrences in
  `test/integration/repo-guardrails.test.js` (verify: each updated test still passes against the
  new fifth shell).
- [ ] 5.3 Add named methods to `public/assets/js/api.js` (`API.listUsers`, `API.createUser`,
  `API.disableUser`, `API.resetUserPassword`, `API.revokeUserSessions`, `API.listFilePolicies`,
  `API.setFilePolicy`, `API.grantFilePermission`, `API.revokeFilePermission`) — no ad hoc `fetch`
  from `admin.js` (verify: `grep -rn "fetch(" public/assets/js/admin.js` returns nothing).
- [ ] 5.4 Build the user-management UI (create/disable/delete/reset-password/revoke-sessions/
  search) and the file-policy UI (publish/unpublish/lock/unlock/access-mode/availability-window/
  per-user grant), both stating plainly that a policy has no effect on what this application
  currently serves (per `design.md` D5) (verify: `test/frontend/admin.test.js` pins both the
  controls and the disclosure copy).
- [ ] 5.5 Add a login view and update `public/assets/js/api.js`'s response handling so a `401`
  raises a distinct auth-required signal (not a generic network error) that routes to login and
  preserves the intended destination (verify: a protected-page load with no session redirects to
  login rather than showing a network-error toast).

## 6. Documentation

- [ ] 6.1 Update `docs/CONTRACTS.md` with every new endpoint's envelope shape (verify: every route
  added in groups 2, 4, and 5 has a corresponding entry).
- [ ] 6.2 Update `docs/REPO_MAP.md`: new rows in "Where to Add Things" for a new admin
  endpoint/migration/page, and a one-line note in "Module Boundaries" that the new services own
  the database the way existing services own the filesystem/JSON stores (verify: both sections
  mention the new modules by path).
