---
module: Auth and Access Control
slug: auth-and-access-control
purpose: Session authentication, CSRF, rate limiting, admin user management, and file-access-policy data over SQLite.
roots:
  - src/db/
  - src/routes/
  - src/controllers/
  - src/middlewares/
  - src/services/
  - src/utils/
language: javascript
complexity: medium
loc: 1361
files:
  - src/routes/auth.routes.js
  - src/routes/admin.routes.js
  - src/controllers/auth.controller.js
  - src/controllers/users.controller.js
  - src/controllers/filePolicy.controller.js
  - src/middlewares/authenticate.js
  - src/middlewares/csrf.js
  - src/middlewares/rateLimit.js
  - src/middlewares/requireAdmin.js
  - src/services/SessionService.js
  - src/services/UserService.js
  - src/services/FileAccessPolicyService.js
  - src/utils/crypto.js
  - src/db/connection.js
  - src/db/schema.js
  - src/db/bootstrap.js
  - src/db/repositories/AuditLogRepository.js
  - src/db/repositories/FileAccessPolicyRepository.js
  - src/db/repositories/SessionRepository.js
  - src/db/repositories/UserFilePermissionRepository.js
  - src/db/repositories/UserRepository.js
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
Layered routes -> controllers -> services -> repositories -> SQLite, implementing ADR-009 (phase 1 authentication, phase 2 admin user/file-policy management). Data lives in a dedicated `node:sqlite` database (`<AFM_DATA_DIR>/admin.sqlite`), separate from the JSON metadata/settings stores, opened lazily by the `AdminDatabase` singleton (`src/db/connection.js`), which runs versioned migrations from `src/db/schema.js` on first open (v1: `users`, `sessions`, `audit_logs`; v2: sparse `files`, `file_access_policies`, `user_file_permissions`).

Control enters from `src/routes/api.js` (HTTP API Layer), which mounts `/health`, then `/auth` (`auth.routes.js`, before global auth), then applies `authenticate` and `csrf` to every remaining router, then mounts `/admin` (`admin.routes.js`, which adds `requireAdmin`). `server.js` opens the DB at boot (`connection.get()`), calls `ensureBootstrapAdmin()` to create the first admin from `AFM_BOOTSTRAP_ADMIN_USERNAME`/`_PASSWORD`, and reuses `createRateLimit` for the global limiter. The Files controller calls `FileAccessPolicyService.onPathRenamed/onPathDeleted` as best-effort hooks. Errors exit via `AppError` to the global error handler.

<!-- c2d:s2 -->
### Public API
HTTP routes (served under both `/api/v1` and `/api`):
```
POST   /auth/login                      public, login-throttled; sets afm_session cookie; { success, user, csrfToken }
POST   /auth/logout                     authenticate + csrf; revokes session; { success }
GET    /auth/me                         authenticate; bare { id, username, role, status, csrfToken }
GET    /admin/users                     admin; bare array of public user shapes
POST   /admin/users                     admin; create user -> 201 { success, user }
POST   /admin/users/:id/status          admin; { status } active|disabled; disabling revokes sessions
POST   /admin/users/:id/reset-password  admin; { password }; revokes all sessions
POST   /admin/users/:id/revoke-sessions admin; { success }
DELETE /admin/users/:id                 admin; { success }
GET    /admin/files/policies            admin; bare array
GET    /admin/files/policy?path=        admin; bare object or null
PUT    /admin/files/policy              admin; upsert policy -> { success, policy }
DELETE /admin/files/policy?path=        admin; { success }
GET    /admin/files/permissions?path=   admin; bare array
POST   /admin/files/permissions         admin; { path, userId, permission } -> 201 { success, permission }
DELETE /admin/files/permissions         admin; body { path, userId } -> { success }
```
Middleware and helpers:
```js
authenticate(req, res, next)          // cookie or Bearer token -> req.user/req.session, else 401
SESSION_COOKIE = 'afm_session'; readCookie(req, name)
csrf(req, res, next)                  // non-GET/HEAD/OPTIONS needs x-csrf-token header or body.csrfToken === session.csrf_secret, else 403
csrf.CSRF_HEADER = 'x-csrf-token'
createRateLimit({ writePerMinute?, readPerMinute? }) // fixed-window per-IP limiter, 429 + Retry-After
WINDOW_MS, DEFAULT_WRITE_PER_MINUTE (60), DEFAULT_READ_PER_MINUTE (600)
requireAdmin(req, res, next)          // req.user.role === 'admin', else 403
```
Services / DB (singleton instances):
```js
SessionService.login({ username, password, ip, userAgent }) -> { ok:false } | { ok:true, token, csrfSecret, session, user }
SessionService.validateSession(token) -> { session, user } | null
SessionService.revokeSession(sessionId); SessionService.revokeAllForUser(userId)
UserService.create({ username, email, password, role }); .list(); .setStatus(id, status); .resetPassword(id, pw); .delete(id)
FileAccessPolicyService.list(); .getByPath(p); .setPolicy(p, opts); .deletePolicy(p)
FileAccessPolicyService.grantPermission(p, userId, permission, grantedBy); .revokePermission(p, userId); .listPermissions(p)
FileAccessPolicyService.onPathRenamed(oldPath, newPath); .onPathDeleted(path)   // best-effort, never throw
hashPassword(pw); verifyPassword(pw, stored); randomToken(bytes=32); hashToken(token)   // src/utils/crypto.js
AdminDatabase.get(); AdminDatabase.reset(); AdminDatabase.dbPath                         // src/db/connection.js
migrate(db); MIGRATIONS                                                                 // src/db/schema.js
ensureBootstrapAdmin(source = process.env)                                              // src/db/bootstrap.js
```

<!-- c2d:s3 -->
### Internal Patterns
- **Singleton instances**: every service and repository exports `new X()`; `AdminDatabase` exposes a mutable `dbPath` and `reset()` so tests can redirect it before `server.js` loads (mirrors MetadataService).
- **Repository pattern**: repositories are the only place SQL appears; each method calls `AdminDatabase.get().prepare(...)` per call (no statement caching).
- **Synchronous I/O**: `node:sqlite` `DatabaseSync` and `crypto.scryptSync` are used on the request path — a documented deliberate exception to the project's async-only rule. Rollback-journal mode, not WAL; `PRAGMA foreign_keys = ON`.
- **Migrations**: `schema_migrations` table, each migration in its own BEGIN/COMMIT; refuses a stored version newer than known.
- **Token hygiene**: session tokens are random 32-byte hex, persisted only as SHA-256 hash; CSRF secret (16 bytes) stored raw on the session row and returned to the client. Passwords use scrypt `salt:hash` with `timingSafeEqual`.
- **Login throttling**: account lockout after 10 consecutive failures for 15 minutes, plus a per-IP fixed-window limiter (default 10/min, `AFM_LOGIN_RATE_LIMIT_PER_MINUTE`). All failure modes return an identical 401.
- **Rate limiter**: in-memory `Map` of `write:ip`/`read:ip` buckets with lazy sweep; 0 disables a class; env overrides read at module load.
- **Audit logging**: admin controllers write `audit_logs` rows synchronously on success and failure (not fire-and-forget).
- **Response envelope**: mutations return `{ success: true, ... }`; reads return bare shapes (project rule 6). `UserService._publicShape` strips `password_hash`, `failed_login_count`, `locked_until`.
- **Policy upsert**: `files` rows are created lazily; `setPolicy` merges unspecified fields from the existing row (default `access_mode` `restricted`). Policies are data only — no enforcement on file reads yet.
- Cookie is hand-built (`HttpOnly; SameSite=Lax; Max-Age=86400`, `Secure` in production); cookie parsing is hand-rolled (no cookie-parser).

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - Server Bootstrap and Config — `src/config/env` (`config.env` for the `Secure` cookie flag), `src/config/dataDir` (`resolveDataDir` for the SQLite path); `server.js` opens the DB and calls `ensureBootstrapAdmin`.
   - Storage Services — `src/utils/validators` (`validateClientPath`) and `src/utils/AppError` (error contract) shared with the storage layer.
2. **Third-party packages**
   - `express` ^5.2.1 — `express.Router()` for auth and admin routers.
   - `node:sqlite` and `crypto` are Node built-ins (Node >=24), not packages.

<!-- c2d:s5 -->
### Complexity
Medium. Each file is short (largest is 136 lines) with shallow branching, and the layering is consistent, but the module is security-critical: session issuance/validation, password hashing, CSRF, lockout, and rate limiting all live here, and it introduces a second persistence technology (synchronous SQLite with migrations and transactions) alongside the JSON stores. The most complex unit is `SessionService.login` together with `FileAccessPolicyRepository.upsertPolicy`: `login` combines status, lockout, password verification, failure counting and token issuance with uniform failure responses, while `upsertPolicy` performs a manual BEGIN/COMMIT/ROLLBACK transaction spanning two tables with conditional insert-or-update logic.

<!-- c2d:s6 -->
### Key Files
- `src/middlewares/authenticate.js` — resolves cookie/Bearer token to `req.user`/`req.session`; the gate for every non-public endpoint.
- `src/services/SessionService.js` — login with lockout, session creation, validation, and revocation.
- `src/middlewares/csrf.js` — enforces the per-session CSRF secret on all non-safe methods.
- `src/db/schema.js` — the full admin database schema and migration runner.
- `src/db/connection.js` — lazy singleton `node:sqlite` connection with test-redirectable path.
- `src/routes/admin.routes.js` — admin-only user and file-policy endpoint surface.
- `src/services/FileAccessPolicyService.js` — validation and upsert logic for per-file access policies and user permissions.

<!-- c2d:s7 -->
### Limitations & Improvements

**1. Deleting a user who ever acted as admin fails with a 500 — Bug or Risk (medium)**
`src/db/schema.js` 50-61, 85-96; `src/services/UserService.js` 57-60. `audit_logs.actor_id`, `file_access_policies.created_by/updated_by` and `user_file_permissions.granted_by` reference `users(id)` with no `ON DELETE` action, and `connection.js` turns `PRAGMA foreign_keys = ON`. Every admin mutation writes an `audit_logs` row with `actor_id = req.user.id`, so `DELETE /admin/users/:id` on any admin who has performed an admin action raises a SQLite FOREIGN KEY constraint error. It's a raw `Error`, not an `AppError`, so the response is a generic 500 and not a meaningful 409. Fix: add a migration v3 that rebuilds those columns with `ON DELETE SET NULL` (audit rows should outlive their actor), or soft-delete users and only allow `status = 'disabled'`.
```sql
-- before
actor_id INTEGER REFERENCES users(id),
-- after (migration v3 table rebuild)
actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
```

**2. No guard against removing the last active admin — Bug or Risk (medium)**
`src/controllers/users.controller.js` 43-95; `src/services/UserService.js` 41-60. An admin can disable or delete their own account, or the only other admin. `setStatus` then revokes all of that admin's sessions. `ensureBootstrapAdmin` only runs when `users` is empty, so with non-admin users still present the admin panel becomes unreachable with no in-app recovery. Fix: in `UserService.setStatus`/`delete`, refuse (409) when the target is an active admin and `SELECT COUNT(*) FROM users WHERE role='admin' AND status='active'` is 1. Also consider refusing `id === req.user.id`.

**3. Lockout re-arms on every failure after it expires — Bug or Risk (medium)**
`src/services/SessionService.js` 27-36; `src/db/repositories/UserRepository.js` 42-56. `failed_login_count` is only reset on a successful login. Once the 15-minute lock lapses, the count is still at least 10, so a single wrong password locks the account again for 15 minutes. Because the lockout is keyed on username alone, anyone who knows an admin's username can keep that account locked forever with one request per 15 minutes. The per-IP limiter does not help here. Fix: reset the counter when an expired lock is observed, and consider IP+account throttling in place of a hard account lock.
```js
// before
if (user.locked_until && user.locked_until > Date.now()) return { ok: false };
// after
if (user.locked_until) {
    if (user.locked_until > Date.now()) return { ok: false };
    UserRepository.resetLoginFailures(user.id);
    user.failed_login_count = 0;
}
```

**4. Login reveals account existence through timing and through status codes — Bug or Risk (medium)**
`src/services/SessionService.js` 24-29; `src/utils/crypto.js` 20-23. A nonexistent, disabled or locked username returns immediately, while an active username pays for a `scryptSync`, so response time tells the two apart. Separately, `verifyPassword` passes `password` straight to `scryptSync`. A request with an existing username and a missing or non-string `password` throws `ERR_INVALID_ARG_TYPE` and returns a 500, while an unknown username returns 401. That contradicts the "identical 401 for every failure" contract. Fix: reject non-string credentials up front with the same 401, and run `verifyPassword` against a fixed dummy hash when the user is missing or inactive.
```js
if (typeof username !== 'string' || typeof password !== 'string') return { ok: false };
const user = UserRepository.findByUsername(username.trim());
const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
if (!user || user.status !== 'active' || !ok) { /* existing failure handling */ }
```

**5. Policy rows go stale when a directory is renamed or deleted — Bug or Risk (medium)**
`src/db/repositories/FileAccessPolicyRepository.js` 86-94; `src/services/FileAccessPolicyService.js` 91-101. `renamePath`/`deletePath` match `client_path = ?` exactly. Renaming or deleting `/a` leaves the policies and permissions of `/a/b.txt` under the old path. A deleted path's rows can later attach to a different file created at the same path, which matters once enforcement lands. A rename onto a path that already has a `files` row hits the UNIQUE constraint, and the error is swallowed silently. Fix: also update descendants (`WHERE client_path = ? OR client_path LIKE ? || '/%'`, rewriting the prefix with `? || substr(client_path, length(?) + 1)`), and delete the destination row first on rename.

**6. Policy flags are not type-validated — Bug or Risk (low)**
`src/services/FileAccessPolicyService.js` 30-54; `src/db/repositories/FileAccessPolicyRepository.js` 68-74. `isDirectory`, `isPublished` and `isLocked` are coerced by truthiness (`isPublished ? 1 : 0`), so a JSON body with `"isPublished": "false"` stores `1`. Fix: reject non-boolean values with a 400, matching the existing `accessMode` and date checks.

**7. A malformed session cookie turns into a 500 — Bug or Risk (low)**
`src/middlewares/authenticate.js` 10-19. `decodeURIComponent` throws `URIError` on input such as `afm_session=%E0%A4%A`. `authenticate` is synchronous and Express forwards the throw, so every protected endpoint answers 500, not 401, until the cookie is cleared. Fix: wrap the decode and treat a failure as "no cookie".
```js
try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
```

**8. The CSRF comparison is not constant-time and is not typed — Improvement Opportunity (low)**
`src/middlewares/csrf.js` 22-23. `presented !== req.session.csrf_secret` is a short-circuit string compare. `body.csrfToken` is also accepted on every route, not only the form-POST download path the comment justifies, and it may be a non-string. Fix: require a string, compare with `crypto.timingSafeEqual` on equal-length buffers, and optionally limit the body-field fallback to `POST /fs/download-zip`.

**9. Expired sessions and old audit logs are never purged — Limitation (low)**
`src/db/repositories/SessionRepository.js` 7-39; `src/db/repositories/AuditLogRepository.js` 19-23. Nothing deletes expired or revoked `sessions` rows. `AuditLogRepository.prune` exists, but nothing in `src/` or `server.js` calls it, so both tables grow without bound. Fix: at boot, and on a long interval, run `DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL` and `AuditLogRepository.prune(retentionMs)`.

**10. A synchronous SQLite write on every authenticated request — Improvement Opportunity (low)**
`src/services/SessionService.js` 54-62; `src/db/repositories/SessionRepository.js` 28-30. `validateSession` calls `touch()` on every request, Dashboard polling included. That is a blocking write and a journal sync on the event loop. `last_seen_at` is informational, so throttle it.
```js
if (Date.now() - session.last_seen_at > 60_000) SessionRepository.touch(session.id);
```

**11. Duplicated constants and parsing — Improvement Opportunity (low)**
`src/controllers/auth.controller.js` 9 and `src/services/SessionService.js` 9 each define the 24h TTL, so the cookie `Max-Age` can drift from the server expiry. `src/routes/auth.routes.js` 27-31 copies `perMinute` from `src/middlewares/rateLimit.js` 39-43. Fix: export `SESSION_TTL_MS` from `SessionService` (the cookie uses `/ 1000`) and export `perMinute` from `rateLimit.js`.

**12. An audit write inside a `catch` can mask the original error — Improvement Opportunity (low)**
`src/controllers/users.controller.js` 8-18, 36-94; `src/controllers/filePolicy.controller.js` 7-17, 50-101. The failure-path `audit()` is a synchronous DB insert that runs before `next(error)`. If it throws (for example a locked or corrupt DB), the original `AppError` such as a 400 or 404 is replaced by a 500 from inside the catch. Fix: wrap the failure-path audit in its own `try { ... } catch {}`.
