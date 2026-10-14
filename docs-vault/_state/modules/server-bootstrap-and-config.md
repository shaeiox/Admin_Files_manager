---
module: Server Bootstrap and Config
slug: server-bootstrap-and-config
purpose: Loads and validates environment configuration, assembles the Express app, boots the listener, and drains on shutdown.
roots:
  - server.js
  - src/config/
language: javascript
complexity: medium
loc: 416
files:
  - server.js
  - src/config/env.js
  - src/config/dataDir.js
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
A linear bootstrap script plus a configuration layer. `server.js` is the process entry point: it requires `src/config/env.js` (which loads `.env` via dotenv and builds a plain `config` object), creates the Express app, and registers middleware in a fixed, load-bearing order:

1. `trust proxy` = 1 hop (nginx, ADR-008).
2. `helmet` with an explicit, measured Content-Security-Policy (`CSP_DIRECTIVES`: `script-src 'self'`, `style-src` allowing `'unsafe-inline'` and Google Fonts, `frame-ancestors 'self'`, etc.).
3. `cors` - registered only when `config.cors.enabled`, reflecting allowlisted origins (or `*` with explicit wildcard opt-in), `credentials: false`.
4. `createRateLimit()` on `/api`, placed before body parsers so floods are refused unparsed.
5. `express.json`, `express.urlencoded`, `morgan('dev')`.
6. `express.static(public/)`.
7. `app.use(['/api/v1', '/api'], apiRoutes)` - one route assembly served at the versioned prefix and the compatibility alias (ADR-007).
8. `/api` catch-all JSON 404 (two-arg, never calls `next()`, so it must be last of the API mounts).
9. Pathless SPA fallback: non-`/api` GETs receive `public/index.html`.
10. Global `errorHandler`.

After the app is assembled, control proceeds to startup validation (`config.validateStartup()`; any problem is printed as `FATAL CONFIGURATION ERROR` and the process exits 1), then synchronous admin-database open/migration (`src/db/connection.get()`) and `ensureBootstrapAdmin()`, then `app.listen(config.port)`. Control exits via SIGTERM/SIGINT handlers that call `shutdown()`: `server.close()` drains in-flight requests, idle keep-alive sockets are closed, and an unref'd 30 s timer forces `exit(1)` if draining stalls.

`src/config/dataDir.js` is a side-effect-free helper resolving the store directory (`AFM_DATA_DIR` or `<cwd>/data`), split out so store singletons can use it without loading the full config.

<!-- c2d:s2 -->
### Public API
```js
module.exports = server            // server.js - the http.Server returned by app.listen
```
The live listener; exported so tests can read the bound port and close it.

```js
module.exports.app = app           // server.js - the Express application
```
Exposed so tests can assert middleware configuration (e.g. `trust proxy`) without re-booting.

```js
config = { port, env, storageRoot, dataDir, cors: { enabled, allowedOrigins, allowWildcard }, uploadFreeSpaceBytes, DEFAULT_UPLOAD_FREE_SPACE_BYTES, validateStartup }   // src/config/env.js
```
Process-wide configuration object derived from `process.env` (after `dotenv.config()`), consumed by services, the DB connection, and the auth controller.

```js
config.validateStartup(source = process.env): string[]   // src/config/env.js
```
Returns a list of configuration problems (empty = usable): STORAGE_ROOT presence/absoluteness/platform/existence, AFM_DATA_DIR (required in production), UPLOAD_MAX_BYTES, AFM_UPLOAD_FREE_SPACE_BYTES, CORS allowlist rules, bootstrap-admin credential pairing and length.

```js
resolveDataDir(source = process.env): string   // src/config/dataDir.js
```
Absolute store directory: `path.resolve(AFM_DATA_DIR)` or `<cwd>/data`.

Environment variables read: `NODE_ENV`, `PORT`, `STORAGE_ROOT`, `AFM_DATA_DIR`, `UPLOAD_MAX_BYTES`, `AFM_UPLOAD_FREE_SPACE_BYTES`, `AFM_CORS_ENABLED`, `AFM_CORS_ALLOWED_ORIGINS`, `AFM_CORS_ALLOW_WILDCARD`, `AFM_BOOTSTRAP_ADMIN_USERNAME`, `AFM_BOOTSTRAP_ADMIN_PASSWORD`.

HTTP surface owned directly here: `ALL /api/*` unmatched -> `404 { success: false, error: 'API endpoint not found' }`; `GET <non-/api>` -> `public/index.html`; static files from `public/`.

<!-- c2d:s3 -->
### Internal Patterns
- **Deferred validation:** `env.js` never exits at require time; validation is a pure function returning problem strings, invoked only by `server.js`. This keeps the config importable by test suites with string-only roots. Validation is injectable via the `source` parameter.
- **Module-level singleton config:** a plain object built once at require time; parse helpers (`parseBool`, `parseCorsAllowedOrigins`, `parseUploadFreeSpaceBytes`) normalize raw strings. `parseUploadFreeSpaceBytes` returns `undefined` on bad input, leaving rejection to `validateStartup`.
- **Sync fs in validation:** `directoryProblems` uses `fs.statSync` / `fs.accessSync` - acceptable because it runs only at boot, not on the request path.
- **Order-sensitive middleware chain:** documented in comments; mount order of the API assembly vs. the catch-all and rate limiter vs. body parsers is load-bearing.
- **Ordered timeouts:** app grace 30 s < systemd `TimeoutStopSec` 45 s < nginx `proxy_read_timeout` 600 s.
- **Conditional middleware registration:** CORS middleware is absent entirely (not merely permissive-off) unless enabled.
- **Fail-fast boot:** DB open/migration runs synchronously before `listen`, so schema failures stop boot like config errors.
- Deviation: `dataDir.js` uses `'use strict'`; `env.js` and `server.js` do not.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - HTTP API Layer - `src/routes/api.js` (route assembly), `src/middlewares/errorHandler`, `src/middlewares/rateLimit` (`createRateLimit`).
   - Auth and Access Control - `src/db/connection` (`get()` opens/migrates the admin DB), `src/db/bootstrap` (`ensureBootstrapAdmin()`).
   - (Reverse) Metadata and Settings Stores, Storage Services, and the auth controller import `src/config/env` / `src/config/dataDir`; Deployment Scripts (`scripts/deploy.sh`) reference this config contract.
2. **Third-party packages**
   - `express` ^5.2.1 - HTTP framework, static serving, body parsers.
   - `helmet` ^8.3.0 - security headers and CSP.
   - `cors` ^2.8.6 - optional allowlisted CORS.
   - `morgan` ^1.12.1 - `dev` request logging.
   - `dotenv` ^17.4.2 - loads `.env` without overriding existing process env.

<!-- c2d:s5 -->
### Complexity
Medium. The code is small (416 lines across three files) and mostly linear, but it encodes many order-sensitive and security-relevant invariants: middleware ordering, CSP directives, CORS origin reflection, proxy trust, fail-fast boot, and coordinated shutdown timeouts. The most complex function is `validateStartup` in `src/config/env.js` (~80 lines, roughly 20 branches): it cross-checks platform-specific path absoluteness (rejecting Windows spellings on POSIX), filesystem existence/permissions, integer parsing for two byte limits, a multi-rule CORS origin allowlist with duplicate detection via `URL` normalization and production-only wildcard refusal, and paired bootstrap-admin credentials.

<!-- c2d:s6 -->
### Key Files
- `server.js` - Process entry point: builds the Express middleware chain, validates config, opens the admin DB, listens, and handles graceful shutdown.
- `src/config/env.js` - Loads `.env`, exposes the `config` object, and implements `validateStartup` with all boot-time configuration checks.
- `src/config/dataDir.js` - Side-effect-free resolver for the metadata/settings store directory.

<!-- c2d:s7 -->
### Limitations & Improvements

#### 1. CORS allowlist is validated in normalized form but matched as a raw string — Bug or Risk (medium)
**Files:** `src/config/env.js` lines 141-149 and 167-182; `server.js` lines 69-81.
`validateCorsOrigin` accepts any value whose `URL` pathname is `/` or empty, so `https://app.example.com/` (trailing slash) and `https://App.Example.com` (mixed-case host) both pass startup validation, and the duplicate check compares `new URL(origin).origin.toLowerCase()`. At request time, however, `server.js` compares the browser's `Origin` header against the raw configured strings with `allowedOrigins.includes(requestOrigin)`. A browser always sends `https://app.example.com` (no trailing slash, lowercase host), so an entry that validation accepted never matches, and that origin is refused without any warning. The failure is closed (safe) but silent.
**Fix:** normalize once at parse time and compare normalized values.
```js
// before (env.js)
return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
// after: store what the browser will actually send
.map((s) => { try { return s === '*' ? s : new URL(s).origin; } catch { return s; } })
```
Alternatively, have `validateCorsOrigin` reject any value where `new URL(value).origin !== value`.

#### 2. Directory checks do not test writability — Limitation (medium)
**File:** `src/config/env.js` lines 184-199.
`directoryProblems` checks `R_OK | X_OK` only. `STORAGE_ROOT` must be writable for uploads, folder creation, rename and delete, and `AFM_DATA_DIR` must be writable for the metadata/settings stores (atomic temp-file-then-rename). A read-only root or data directory passes startup and then fails per request — the per-request failure the fail-fast design is meant to prevent.
**Fix:** add `W_OK` to the access mask for both directories (or a separate writable check with its own message).
```js
// before
fs.accessSync(dir, fs.constants.R_OK | fs.constants.X_OK);
// after
fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
```

#### 3. `PORT` is never validated — Bug or Risk (low)
**Files:** `src/config/env.js` line 41; `server.js` line 148.
`port: process.env.PORT || 3000` passes the raw string to `app.listen`. A non-numeric value such as `PORT=abc` is treated by Node as a pipe/Unix-socket path, so the server "boots" without listening on any TCP port. An out-of-range value throws `RangeError` with a stack trace instead of a `FATAL CONFIGURATION ERROR` line. Every other numeric variable goes through `validateStartup`; this one does not.
**Fix:** add a check to `validateStartup`, for example: if `source.PORT` is set, require `/^\d+$/` and `1 <= n <= 65535`.

#### 4. Listener errors are not handled — Improvement Opportunity (low)
**File:** `server.js` lines 148-155.
No `'error'` listener is attached to `server`. A bind failure (`EADDRINUSE`, `EACCES` on a privileged port) surfaces as an unhandled `'error'` event that crashes with a raw stack trace instead of the boot-error format used for config and DB problems.
**Fix:**
```js
server.on('error', (err) => {
    console.error(`FATAL STARTUP ERROR: cannot listen on port ${config.port}: ${err.code || err.message}`);
    process.exit(1);
});
```

#### 5. A second shutdown signal reports a clean exit while transfers are still in flight — Bug or Risk (low)
**File:** `server.js` lines 168-184.
`process.once` is registered per signal, so `SIGTERM` followed by `SIGINT` (or the reverse) runs `shutdown()` twice. The second `server.close(cb)` runs against a server that is no longer listening, so Node calls `cb` with `ERR_SERVER_NOT_RUNNING`. The callback ignores its error argument, logs "All connections closed", and calls `process.exit(0)`. In-flight uploads and downloads are cut off, but the process exits with status 0 and a misleading message.
**Fix:** guard with a module-level `shuttingDown` flag (and treat a repeat signal as an explicit forced exit with status 1), and check the `err` argument in the close callback.

#### 6. Requests rejected before morgan are never logged — Improvement Opportunity (low)
**File:** `server.js` lines 86-90.
`morgan('dev')` is registered after the rate limiter and after both body parsers. A `429` from `createRateLimit()` ends the chain before morgan, and a malformed JSON body makes `express.json` call `next(err)`, which skips morgan and goes straight to `errorHandler`. Rate-limit floods and parse failures, the events an operator most wants to see, never reach the request log.
**Fix:** register `morgan('dev')` first (it logs on response finish, so placing it early costs nothing):
```js
app.use(morgan('dev'));
app.use('/api', createRateLimit());
app.use(express.json());
```

#### 7. SPA fallback answers missing static assets with `index.html` — Improvement Opportunity (low)
**File:** `server.js` lines 113-120.
The fallback serves `index.html` with `200` for every non-`/api` GET, including mistyped asset paths such as `/assets/js/missng.js`. The comment says "GET requests that expect HTML", but `Accept` is not checked. A broken asset reference therefore shows up as a MIME/nosniff refusal in the browser instead of a `404`. This is harmless at runtime but makes asset regressions harder to diagnose.
**Fix:** only fall back when `req.accepts('html')`, or skip paths with a file extension and let them `404`.

#### 8. Stale doc comment in `dataDir.js` — Improvement Opportunity (low)
**File:** `src/config/dataDir.js` lines 9-11.
The comment calls this module side-effect free "unlike config/env, which exits without STORAGE_ROOT". `env.js` no longer exits at require time; the exit moved into `validateStartup`, called by `server.js` (see the `validateStartup` doc block, `env.js` lines 67-84). The comment therefore misstates current behaviour. The remaining real difference is that `env.js` runs `dotenv.config()` on load.
**Fix:** reword to "unlike config/env, which loads `.env` on require".
