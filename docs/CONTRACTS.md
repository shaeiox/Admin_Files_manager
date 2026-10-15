# CONTRACTS.md — API & Data Contracts

> The stable surface between frontend and backend. Changing anything here is a breaking change —
> update this file in the same commit.

## Conventions

- **Base URL:** `/api/v1` is the contract; `/api` is a retained compatibility alias served by the
  same handlers. Paths below are written in their unversioned form — every one of them is served
  identically under `/api/v1`. See *API versioning* (ADR-007).
- **Success shape — a rule, not an exception.** Read-only **aggregate** endpoints return a
  **bare top-level shape** (the payload *is* the body, no wrapper). **Mutating** endpoints return
  the `{ "success": true, "data": ... }` envelope. `GET /api/dashboard/summary` and
  `GET /api/dashboard/health` are read-only aggregates, so they follow the bare precedent like
  `tree` and `list` do — they are **not** exceptions to it:

  | Endpoint | Kind | Body |
  |---|---|---|
  | `GET /api/fs/tree` | read | `[rootNode]` — bare array |
  | `GET /api/fs/list` | read | `{ items, total, counts }` — bare object |
  | `GET /api/dashboard/summary` | read | bare object |
  | `GET /api/dashboard/health` | read | bare array |
  | `POST /api/fs/folder` | write | `{ success, data }` |
  | `POST /api/fs/upload` | write | `{ success, data }` |
  | `PUT /api/fs/rename` | write | `{ success, data }` |
  | `PUT /api/fs/move` | write | `{ success, data }` — **a `200` may still carry failures**, see below |
  | `POST /api/fs/copy` | write | `{ success, data }` — **a `200` may still carry failures**, see below |
  | `DELETE /api/fs/delete` | write | `{ success, data }` — **a `200` may still carry failures**, see below |
  | `POST /api/fs/star` | write | `{ success, data }` |
  | `GET /api/fs/thumbnail/capability` | read | `{ available, formats, maxSize }` — bare object |
  | `GET /api/settings` | read | the settings document — **bare object**, no `success` field |
  | `PUT /api/settings` | write | `{ success, settings }` |
  | `GET /api/auth/me` | read | `{ id, username, role, status, csrfToken }` — bare object |
  | `POST /api/auth/login` · `logout` | write | `{ success, user, csrfToken }` · `{ success }` |
  | `GET /api/admin/users` · `files/policies` · `files/permissions` | read | bare array |
  | `GET /api/admin/files/policy` | read | bare object, or `null` |
  | `POST`/`PUT`/`DELETE /api/admin/...` | write | `{ success, user \| policy \| permission }` or `{ success }` |

  (Verified against every `res.json` call in `fs.controller.js`, `preview.controller.js`,
  `dashboard.controller.js`, `settings.controller.js`, `auth.controller.js`, `users.controller.js`
  and `filePolicy.controller.js`. `GET /api/fs/download`,
  `POST /api/fs/download-zip` and a successful `GET /api/fs/thumbnail` are streams/bytes and return
  no JSON body.)
- **Error:** any status with `{ "success": false, "error": "human-readable message" }`. Never a
  `stack`, in any environment: `errorHandler` forwards only `AppError` messages (authored static
  strings, no absolute path) and masks everything else.
- **Dashboard failure semantics (separate from the shape rule):** the dashboard endpoints answer
  **`200` with per-capability degradation** for the *filesystem* and *volume* capabilities — an
  unreadable volume or an unreadable subtree removes only its own contribution instead of failing
  the response. This is the **one genuine departure** from the project's all-or-nothing error
  model: every other endpoint either succeeds wholly or fails wholly with a non-2xx status. The
  **metadata** capability also degrades — to empty `activities` / `topFiles` — but carries **no
  availability flag** yet. See *Failure semantics* below.
- **Client paths** are POSIX-style strings rooted at `/` relative to `STORAGE_ROOT`
  (e.g. `/media/videos/clip.mp4`). The server rejects anything that escapes the root (`403`).
- **Timestamps:** file `modified` is a **millisecond epoch number**; activity `time` is ms epoch.

### Security posture (ADR-003, extended by api-security-hardening and ADR-009)

**Closed by ADR-009 / `admin-identity-and-access-control` (phase 1):**

- **The API is authenticated.** Every endpoint below, except `GET /health` and `POST /auth/login`,
  requires a session (`afm_session` cookie or `Authorization: Bearer`). This closes ADR-003 §9's
  Critical, scoped to single-tenant authentication — see "Auth endpoints (ADR-009)" below.
- **CSRF defence is in place.** Every non-GET request requires a session-bound `X-CSRF-Token`
  header, checked before any mutation. **File-access policies do not restrict this app**: they
  govern the File Portal only (see "What a policy does" under the admin endpoints). **Still open:** a full
  permission catalogue and the Files-portal integration decision are explicit follow-ups — see
  `openspec/changes/admin-identity-and-access-control/` and ADR-009.

**Closed by `api-security-hardening`:**

- **Cross-origin access is same-origin by default.** `server.js` registers the CORS middleware only
  when `AFM_CORS_ENABLED=true`, from a validated allowlist (`AFM_CORS_ALLOWED_ORIGINS`); otherwise no
  `Access-Control-Allow-*` header is emitted at all and every cross-origin call is refused by the
  browser. Wildcards require `AFM_CORS_ALLOW_WILDCARD=true` and are **refused when
  `NODE_ENV=production`**. This is what removes the drive-by exposure: any page the operator visits
  can no longer reach a mutating endpoint.
- **A content security policy is enabled.** `script-src 'self'` with no `'unsafe-inline'` and no
  `unsafe-eval`, plus `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`. The shipped
  shells contain no inline script and no inline event handler, so the policy is real rather than
  aspirational. **Known gap:** `style-src` still carries `'unsafe-inline'` because 13 inline `style=`
  attributes live in the page modules' `innerHTML` templates; rendering-time escaping remains the
  layer between a filesystem-derived string and the DOM. Tighten `style-src` once those templates
  stop emitting inline styles.
- **Symbolic links and junctions are not followed on the read boundary.** `PathService
  .resolveSecureRealPath()` canonicalises and re-checks containment, so a link inside `STORAGE_ROOT`
  pointing outside it is refused with `403` by download, list, ZIP and preview. Previously the
  lexical check passed and `fs.stat` followed the link.
- **Mutating routes are rate limited.** Per client, keyed on `req.ip` (which is trustworthy because
  `server.js` sets `trust proxy` to the single documented nginx hop). Reads have a separate, much
  larger allowance.
- **Uploads are governed by free space and concurrency.** Below `AFM_UPLOAD_FREE_SPACE_BYTES` the
  upload is refused with `507` **before any byte is staged**; an unreadable capacity reading admits
  the upload rather than locking the operator out.
- **`GET /api/v1/health` no longer reports `NODE_ENV`.** It reports `success`, `message` and
  `apiVersion` — `apiVersion` is the deployment activation gate in `scripts/deploy.sh` and must stay.
  This is a deliberate departure from ADR-007's additive-only rule: the field was informational, and
  the sidebar identity block now reports an honest absence instead.
- **`.env` is excluded from version control** (`.gitignore`), closing the ADR-001 open question on
  the environment file; ADR-003 tracks the remainder.

## API versioning (ADR-007)

- **`/api/v1` is the contract.** Every endpoint in the table below answers under `/api/v1/<resource>`
  with the same status, the same guards and a byte-identical body as under `/api/<resource>`.
  Resources: `health`, `auth`, `fs`, `dashboard`, `settings`, `admin`.
- **`/api` is a compatibility alias, not a second contract.** It is served by the **same router
  instances** (one assembly, `src/routes/api.js`), so the two prefixes cannot drift and a fix lands on
  both. It is retained for existing callers and open tabs. Its removal is **not scheduled**: it needs
  its own decision, and is blocked on authentication — removing an alias does not reduce the exposure
  that authentication (ADR-003) is required to close.
- **Mount order (load-bearing).** `server.js` mounts the assembly once, as
  `app.use(['/api/v1', '/api'], apiRoutes)`, **before** the `/api` 404 catch-all (a two-argument
  middleware that never calls `next()`; anything mounted after it is unreachable). `/api/v1` is listed
  first, so a v1 request is never re-interpreted under the alias. Pinned by
  `test/api/versioning.contract.test.js`.
- **Unknown versions are refused.** `/api/v2/...` matches no route, reaches the catch-all, and answers
  `404 { "success": false, "error": "API endpoint not found" }` — never v1's handlers, never the HTML
  shell. The version segment is matched **case-sensitively** (`/api/V1/...` is an unknown version),
  although the rest of the path keeps Express's default case-insensitive matching.
- **The version is selected by the path only** — no header, query parameter, cookie or content
  negotiation. Route modules declare no version segment; it is applied at the mount site only.
- **Version discovery:** `GET /api/v1/health` (and its alias) carries `"apiVersion": 1`.
- **Compatibility rules within v1 — additive only.** Allowed: a new endpoint, a new optional response
  field, a new optional request parameter whose absence reproduces the previous behaviour. Anything
  that removes, renames or retypes a field, parameter or endpoint goes to a future `/api/v2`, mounted
  **alongside** v1 (v1 keeps serving). There is no deprecation-header machinery, because nothing is
  deprecated.
- **Client base URL.** `public/assets/js/api.js` resolves `API.BASE_URL` once at load, first non-blank
  wins: `window.AFM_API_BASE` → `<meta name="afm-api-base" content="…">` → `/api/v1`. Trimmed; trailing
  `/` stripped. The four page shells ship `<meta name="afm-api-base" content="/api/v1">`, so the default
  deployment is same-origin and root-relative. Pointing it at `/api` is the configuration-only rollback;
  pointing it at another host is a configuration change too, but **requires authentication and a
  deliberate CORS decision first** (ADR-003) — CORS is unchanged by versioning.
- **Every API URL is built inside `api.js`.** Page modules pass endpoint paths to
  `API.get/post/put/del/upload` and use `API.downloadFile` / `downloadMultipleFiles` / `downloadZip` /
  `thumbnailUrl(path, size)` for non-fetch transports; none reads `BASE_URL` to build a path or calls
  `fetch` (only `router.js` does, for static page markup, which is not an API call). Pinned by
  `test/frontend/api-boundary.test.js` and `test/integration/repo-guardrails.test.js`.

## Endpoints

Every path is served identically under `/api/v1` (the contract) and `/api` (the alias). **Access**
column: *public* = no session; *session* = `afm_session` cookie or `Authorization: Bearer`, plus
`X-CSRF-Token` on every non-GET; *admin* = session whose user has `role = "admin"`.

**Middleware order for every `/api` request** (`server.js`, then `src/routes/api.js`):
general rate limiter (`/api` only) → `express.json` / `urlencoded` → `morgan` → version-segment
guard → `GET /health` → `/auth` router (self-gated) → `authenticate` → `csrf` → resource routers
(`/fs`, `/dashboard`, `/settings`, `/admin` + `requireAdmin`) → `/api` 404 catch-all →
`errorHandler`.

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | `/api/health` | public | ✅ live | Liveness check — additive `apiVersion` (ADR-007); `env` removed (`api-security-hardening`) |
| POST | `/api/auth/login` | public | ✅ live | Issues a session cookie + CSRF token; own per-IP throttle |
| POST | `/api/auth/logout` | session | ✅ live | Revokes the calling session |
| GET | `/api/auth/me` | session | ✅ live | Current user + the session's CSRF token |
| GET | `/api/dashboard/summary` | session | ✅ live | Read-only aggregate; bare object, `200` with per-capability degradation |
| GET | `/api/dashboard/health` | session | ✅ live | Read-only aggregate; bare array of runtime metric objects |
| GET | `/api/settings` | session | ✅ live | Read-only aggregate; **bare** settings document, no envelope |
| PUT | `/api/settings` | session | ✅ live | Strict validated **full replace**; `400` on any unknown key or bad value |
| GET | `/api/fs/tree` | session | ✅ live | Sidebar tree, exactly 2 levels below the root |
| GET | `/api/fs/list` | session | ✅ live | Directory listing, filter/sort/paginate, `starredOnly` |
| GET | `/api/fs/download` | session | ✅ live | Stream single file attachment |
| GET | `/api/fs/thumbnail/capability` | session | ✅ live | Whether previews can be produced (bare object) |
| GET | `/api/fs/thumbnail` | session | ✅ live | Bounded image preview, or an explicit unavailable marker |
| POST | `/api/fs/folder` | session | ✅ live | Create directory |
| POST | `/api/fs/upload` | session | ✅ live | Multipart upload — **field order matters**, see below |
| POST | `/api/fs/star` | session | ✅ live | Toggle or set the starred flag |
| POST | `/api/fs/download-zip` | session | ✅ live | Streams a ZIP of up to 500 paths; CSRF token may be a form field |
| PUT | `/api/fs/rename` | session | ✅ live | Same-directory rename |
| PUT | `/api/fs/move` | session | ✅ live | Bulk move into a folder; a `200` can be a partial failure |
| POST | `/api/fs/copy` | session | ✅ live | Bulk copy into a folder; a `200` can be a partial failure |
| DELETE | `/api/fs/delete` | session | ✅ live | Bulk delete (≤500 paths); a `200` can be a partial failure |
| GET | `/api/admin/users` | admin | ✅ live | List accounts |
| POST | `/api/admin/users` | admin | ✅ live | Create an account (`201`) |
| POST | `/api/admin/users/:id/status` | admin | ✅ live | Enable / disable; disabling revokes sessions |
| POST | `/api/admin/users/:id/reset-password` | admin | ✅ live | Set a new password; revokes sessions |
| POST | `/api/admin/users/:id/revoke-sessions` | admin | ✅ live | Sign the user out everywhere |
| DELETE | `/api/admin/users/:id` | admin | ✅ live | Delete an account |
| GET | `/api/admin/files/policies` | admin | ✅ live | Every path with a policy |
| GET | `/api/admin/files/policy` | admin | ✅ live | One path's policy, or `null` |
| PUT | `/api/admin/files/policy` | admin | ✅ live | Create or update a File Portal policy (see "What a policy does") |
| DELETE | `/api/admin/files/policy` | admin | ✅ live | Remove a policy and its permissions |
| GET | `/api/admin/files/permissions` | admin | ✅ live | Per-user grants/denies on one path |
| POST | `/api/admin/files/permissions` | admin | ✅ live | Grant or deny one user or group, at a level (`201`) |
| DELETE | `/api/admin/files/permissions` | admin | ✅ live | Remove one user's or group's grant/deny |
| GET | `/api/admin/files/group-permissions` | admin | ✅ live | Group grants/denies on one path |
| GET | `/api/admin/files/effective` | admin | ✅ live | What the File Portal decides for a user or a visitor at a path, and why |
| GET | `/api/admin/groups` | admin | ✅ live | Groups with their members |
| POST | `/api/admin/groups` | admin | ✅ live | Create a group (`201`) |
| PUT | `/api/admin/groups/:id` | admin | ✅ live | Rename / re-describe a group |
| DELETE | `/api/admin/groups/:id` | admin | ✅ live | Delete a group and its grants |
| PUT | `/api/admin/groups/:id/members` | admin | ✅ live | Replace a group's members |
| GET | `/api/admin/portal/settings` | admin | ✅ live | Storage volume status, release folder, portal auth tunables |
| PUT | `/api/admin/portal/settings` | admin | ✅ live | Replace release folder + tunables (portal applies within seconds) |
| GET | `/api/admin/portal/config` | admin | ⛔ retired | Always `available:false` (ADR-010) |
| PUT | `/api/admin/portal/config` | admin | ⛔ retired | Always `503` (ADR-010) |
| GET | `/api/admin/logs/portal` | admin | ✅ live | File portal trace, newest first |
| GET | `/api/admin/logs/audit` | admin | ✅ live | Admin audit log, newest first |

### GET /api/health

Liveness probe; **public** (no session). It keeps the envelope because it is not an aggregate, and
it is **not** a source of runtime metrics. ADR-007 added one field, additively: `apiVersion` — the contract
version the responding assembly serves (`1` on both `/api/v1/health` and the `/api/health` alias).
The handler lives in `src/routes/api.js`, not `server.js`.

```json
{ "success": true, "message": "Dimension API is running", "apiVersion": 1 }
```

`env` was **removed** by `api-security-hardening`: an unauthenticated caller is no longer told which
environment it is talking to. The sidebar identity block consequently reports an honest absence
rather than the environment name. `apiVersion` is the deployment activation gate in
`scripts/deploy.sh` and must not be removed.

### Auth endpoints (ADR-009)

Mounted at `/api/auth` (and `/api/v1/auth`), served by `src/routes/auth.routes.js`. These three
routes are the only ones reachable without a session besides `GET /health` — every other endpoint
in this document now requires one. A session is carried either as the `afm_session` cookie
(`HttpOnly`, `SameSite=Lax`, `Secure` in production) or as `Authorization: Bearer <token>`; both
resolve to the same session. Every non-GET request — including `/auth/logout` — also requires an
`X-CSRF-Token` header matching the session's issued token, or it is refused with `403` before any
state changes.

Sessions and accounts are stored in `admin.sqlite` — schema, lifecycle and retention in
`docs/DATABASE.md`. The token is 32 random bytes (hex); only its SHA-256 is persisted. Sessions last
a flat **24 hours** from login (no sliding renewal) and end early on logout, account disable,
password reset, admin revoke or account delete. A session whose user is no longer `active` stops
validating immediately.

#### POST /api/auth/login → `200` (mutating envelope)

Request (JSON or `application/x-www-form-urlencoded`):

```json
{ "username": "admin", "password": "..." }
```

Response:

```http
Set-Cookie: afm_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400[; Secure]
```

```json
{ "success": true, "user": { "id": 1, "username": "admin", "role": "admin" }, "csrfToken": "..." }
```

- `Secure` is added only when `NODE_ENV=production`. The raw token is **only** in the cookie — the
  body carries no token, so a Bearer client must read the cookie value.
- Username matching is case-insensitive and trimmed.
- `401 { "error": "Invalid username or password." }` for every failure: unknown user, wrong
  password, disabled account, locked account. The shape never discloses which one occurred.
- No CSRF token is required (there is no session yet).
- Throttled per-IP by its own limiter (`AFM_LOGIN_RATE_LIMIT_PER_MINUTE`, default 10/minute,
  `0` disables) **in addition to** the general `/api` write limiter → `429` with `Retry-After`.
- After 10 consecutive wrong passwords for one account, it is locked for 15 minutes even against
  its correct password.

#### POST /api/auth/logout → `200` (mutating envelope)

```json
{ "success": true }
```

Requires a session and its CSRF token. Revokes exactly the calling session and clears the cookie
(`Max-Age=0`); other sessions for the same user are unaffected (bulk revoke is an admin-panel
capability, not part of this endpoint). `401` without a session, `403` without the CSRF token.

#### GET /api/auth/me → `200` (bare object — read-only aggregate precedent)

```json
{ "id": 1, "username": "admin", "role": "admin", "status": "active", "csrfToken": "..." }
```

`csrfToken` is the calling session's existing secret, re-issued so a reloaded page (which lost
`api.js`'s in-memory copy) can keep making mutations without logging in again. It is not rotated.
`401` without a valid session — this is how the SPA detects it must send the user to `/login.html`.

#### Using the API from a script

```bash
# 1. log in, keep the cookie, capture the CSRF token
curl -s -c jar -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"..."}' http://localhost:3000/api/v1/auth/login
# 2. reads need only the session
curl -s -b jar 'http://localhost:3000/api/v1/fs/list?path=/'
# 3. every non-GET also needs the token from step 1
curl -s -b jar -X POST -H 'Content-Type: application/json' -H 'X-CSRF-Token: <csrfToken>' \
  -d '{"path":"/reports"}' http://localhost:3000/api/v1/fs/folder
```

`Authorization: Bearer <cookie value>` may replace `-b jar`; the CSRF header is still required on
mutations.

No `password_hash` or throttle bookkeeping ever leaves `UserService`/`SessionService` — every shape
returned to a client is stripped of those fields at the service boundary, not the controller.

### GET /api/dashboard/summary → `200`

Read-only aggregate over the managed tree, its volume, and the metadata store. **Bare object**, no
envelope (see *Conventions → Success shape*). **Every figure is instantaneous** — see *No history is
retained* below. Filesystem and volume sources degrade to a `200` with reduced content; a corrupt
or unreadable metadata store degrades `activities` and `topFiles` to `[]`, also with a `200` and
with no flag distinguishing "unavailable" from "empty" (see *Failure semantics*).

Top-level keys, all always present and **none ever `null`**: `stats`, `storage`,
`storageBreakdown`, `activities`, `topFiles`, `health`. The five arrays are **always arrays**, never
`null` and never absent.

| Field | Type | Unit | Nullable | Meaning |
|---|---|---|---|---|
| `stats` | `array` | — | no (always `[]` or populated) | Headline tiles. Order: `files`, `folders`, `treeBytes`, then `volume` **only if capacity was readable**. |
| `stats[].key` | `string` | — | no | Stable identifier: `files` \| `folders` \| `treeBytes` \| `volume`. |
| `stats[].label` | `string` | — | no | Display label, e.g. `Total files`. |
| `stats[].icon` | `string` | — | no | Icon token; must exist in `AFM.Icons`: `file`, `folder`, `database`, `hardDrive`. (Camel-case — there is no `hard-drive` and no `memory` key.) |
| `stats[].unit` | `string` | — | no | **Present on every entry:** `count` \| `bytes` \| `GB`. |
| `stats[].value` | `number` | per `unit` | no | **The true reading. May legitimately be `0`** — zero is a measurement, never a placeholder, and stats are not floored at 1. Integer. |
| `stats[].trendAvailable` | `boolean` | — | no | **Always `false`.** No history is retained, so there is no trend. |
| `stats[].totalGb` | `number` | GB | **yes — omitted unless `key === 'volume'`** | Rounded volume capacity, companion to the `volume` value. |
| `storage` | `object` | — | no | See the `storage` sub-table. |
| `storage.treeBytes` | `number` | bytes | no | Sum of **regular files** under `STORAGE_ROOT`. Directory entry sizes, dotfiles, links/junctions, and folders excluded. |
| `storage.usedBytes` | `number` | bytes | **`null` when capacity is unreadable** | Volume usage `= bsize * (blocks - bavail)`. `bavail` is pinned, not `bfree` (ext4 reserves blocks). |
| `storage.totalBytes` | `number` | bytes | **`null` when capacity is unreadable** | Volume capacity `= bsize * blocks`. `bsize` is used exactly as reported — never assumed to be a power of two. |
| `storage.volumeAvailable` | `boolean` | — | no | The server's own declaration that it could read the volume. **`false` ⇒ `usedBytes` and `totalBytes` are `null`.** `null` is never substituted with `0`, because `0` reads as a real measurement. |
| `storage.truncated` | `boolean` | — | no | `true` when the walk hit its budget (100,000 entries / 2,000 ms). **A truncated total is a wrong total**, so it must be surfaced to the user, not styled away. |
| `storageBreakdown` | `array` | — | no (always `[]` or populated) | Donut rows, by taxonomy category. **Rows with `bytes === 0` are omitted**, and **folders never appear** (a folder has no bytes to attribute). |
| `storageBreakdown[].key` | `string` | — | no | Taxonomy category: `image` \| `video` \| `document` \| `audio` \| `archive` \| `code` \| `other`. Never `folder`. |
| `storageBreakdown[].label` | `string` | — | no | Capitalised category name. |
| `storageBreakdown[].bytes` | `number` | **bytes** | no | Raw bytes for this category. Travels alongside `valueGb` so the breakdown **reconciles exactly with `storage.treeBytes`**, and so zero-rows are filtered on raw bytes rather than a rounded GB figure. |
| `storageBreakdown[].valueGb` | `number` | **gigabytes (10⁹)** | no | **The unit exception:** delivered in GB (6 dp) because the renderer appends a literal `" GB"` suffix after `Format.compact()` and performs no conversion. Every other byte quantity in this contract is in bytes. |
| `storageBreakdown[].color` | `string` | — | no | A CSS colour **value** (e.g. `#3b82f6`), **never a class name**. |
| `storageBreakdown[].percentage` | `number` | percent (1 dp) | no | Share of the retained rows' total. `0` when the total is `0`. |
| `activities` | `array` | — | no (always `[]`) | Newest-first activity feed (≤ 8). Existing `data/metadata.json` shape **plus** a valid `time` (finite epoch ms, `> 0`). Entries with a missing, non-numeric, non-finite, or non-positive `time` are dropped. |
| `topFiles` | `array` | — | no (always `[]`) | Most-downloaded files, ≤ 5, sorted descending by `downloads` (ties break by path). Entries whose file no longer exists are **dropped before** `max` is computed. |
| `topFiles[].path` | `string` | — | no | **Client path** (POSIX, rooted at `/`). Never an absolute OS path. |
| `topFiles[].downloads` | `number` | count | no | Counter from metadata; only files with `count > 0` are eligible. |
| `topFiles[].max` | `number` | count | no | Server-computed maximum over the **retained** set (not the global peak), so a renderer can compute bar proportions without re-deriving it. |
| `health` | `array` | — | no (always `[]`) | Same rows as `GET /api/dashboard/health`. See below. |

**Live sample** (captured from the running server):

```json
{
  "stats": [
    { "key": "files",     "label": "Total files",   "icon": "file",      "unit": "count", "value": 3,    "trendAvailable": false },
    { "key": "folders",   "label": "Total folders", "icon": "folder",    "unit": "count", "value": 1,    "trendAvailable": false },
    { "key": "treeBytes", "label": "Storage used",  "icon": "database",  "unit": "bytes", "value": 5100, "trendAvailable": false },
    { "key": "volume",    "label": "Volume used",   "icon": "hardDrive", "unit": "GB",    "value": 159,  "trendAvailable": false, "totalGb": 171 }
  ],
  "storage": { "treeBytes": 5100, "usedBytes": 106000000000, "totalBytes": 171000000000, "volumeAvailable": true, "truncated": false },
  "storageBreakdown": [
    { "key": "document", "label": "Document", "bytes": 3400, "valueGb": 0.0000034, "color": "#ef4444", "percentage": 66.7 }
  ],
  "activities": [ { "type": "upload", "user": "system", "action": "uploaded", "target": "a.txt", "folder": "/", "time": 1758500000000 } ],
  "topFiles": [ { "path": "/a.txt", "downloads": 7, "max": 7 } ],
  "health": [
    { "name": "Memory used", "value": 97.3, "unit": "%", "icon": "cpu" },
    { "name": "Uptime", "value": 3, "unit": "s", "icon": "clock" }
  ]
}
```

- The three storage quantities are **distinct and not collapsible**: `treeBytes` (what the managed
  tree weighs) ≠ `usedBytes` (what the volume has consumed) ≠ `totalBytes` (volume capacity). A
  small tree on a nearly-full volume legitimately reports `treeBytes ≈ 0.01%` of `totalBytes`.
- The response never contains an absolute OS path, a drive letter, or a backslash separator.
- **The sidebar volume card calls this endpoint** (`app.js`) because capacity is only available
  here — `/api/dashboard/health` has no configured-root context. It therefore pays for the bounded
  tree walk on every page load; this cost is accepted rather than worked around with a second
  endpoint. See ADR-002.

### GET /api/dashboard/health → `200`

Read-only aggregate of **dashboard runtime metrics**. **Bare array**, no envelope.

| Field | Type | Unit | Nullable | Meaning |
|---|---|---|---|---|
| `health[]` | `array` | — | no (always `[]` or populated) | Top-level body **is** the array. |
| `health[].name` | `string` | — | no | Display name, e.g. `Memory used`, `Uptime`. |
| `health[].value` | `number` | per `unit` | no | The true reading. |
| `health[].unit` | `string` | — | no | `%` for memory; `s` for uptime. **Uptime is a duration, not a ratio.** |
| `health[].icon` | `string` | — | no | Icon token that must exist in `AFM.Icons`: `cpu`, `clock`. |

```json
[
  { "name": "Memory used", "value": 97.3, "unit": "%", "icon": "cpu" },
  { "name": "Uptime", "value": 3, "unit": "s", "icon": "clock" }
]
```

- **No `status` / `level` field.** There is no repository or platform source defining memory or
  uptime thresholds, so asserting `healthy`/`warning`/`critical` would be inventing a judgement.
- **No load average, on any platform.** `os.loadavg()` *exists* on Windows and returns
  `[0, 0, 0]` — a plausible-looking fabricated reading with no error to detect. There is no
  portable capability probe and platform gating is forbidden, so the metric is **omitted entirely**
  rather than reported as a healthy `0%`.
- **Only metrics backed by real platform data.** Anything unsupported or failed is omitted, never
  zero-filled: an absent row means "unavailable", and a present row means a measurement.
- Row set is deterministic for a given process state, so repeated polls must not flicker.
- Capacity-dependent metrics are deliberately absent here — the Dashboard renders disk usage from
  the **summary** payload instead.

### `/api/health` vs `/api/dashboard/health` — two different endpoints

| | `GET /api/health` | `GET /api/dashboard/health` |
|---|---|---|
| Purpose | Liveness + environment | Dashboard runtime metrics |
| Shape | `{success, message, env}` — **envelope** | **bare array** of metric objects |
| Consumers | sidebar identity block (`app.js`) | `dashboard.js` poll |
| Changes in the dashboard work | **NO — byte-identical** | newly added |

`/api/health` was **not** repurposed. Anything that needs the environment string (`env`) uses
`/api/health`; anything that needs a metric uses `/api/dashboard/health`.

### Failure semantics (a departure from the Error Model)

The two dashboard endpoints answer **`200` with per-capability degradation**. A failed source
removes only its own contribution:

| Source that fails | Effect on the response |
|---|---|
| Volume unreadable / degenerate `statfs` | `storage.usedBytes: null`, `storage.totalBytes: null`, `storage.volumeAvailable: false`, and the `volume` entry is **omitted from `stats[]`** — still `200` |
| A single unreadable subtree | Recorded as a diagnostic by the walk; the rest of the walk completes — still `200` |
| Walk budget exhausted (100k entries / 2 s) | Partial totals with `storage.truncated: true` — still `200` |
| **Metadata store corrupt or unreadable** | **⚠️ `500`, not a degraded `200`.** `MetadataService._read` throws `AppError('Metadata store could not be read', 500)` and `getSummary` awaits its four sources via `Promise.all`, so the rejection takes the whole response down. *Degradation is therefore **not** uniform across capabilities — do not extend the pattern without deciding the behaviour per capability.* |

**Consequence for consumers: a `200` does not by itself mean every field is populated.** Check
`volumeAvailable` and `truncated` before rendering.

**`0` is never substituted for "unavailable."** `usedBytes`/`totalBytes` are `number | null`, and
`null` reads as an absence while `0` reads as a real measurement. Conversely, `0` **is** a valid
reading for `treeBytes` or `stats[].value`: an empty tree reports 0 files, 0 folders, 0 bytes.

This is the **one genuine departure** in the API, and it is recorded separately from the
response-shape rule because it concerns *failure* semantics, not *shape*: every other endpoint
either succeeds wholly or fails wholly with a non-2xx status through `AppError` → `errorHandler`.
Degradation applies to the **filesystem and volume** capabilities, which report it through
`volumeAvailable` / skipped subtrees, and to **metadata**, which `getSummary` catches and serves as
empty arrays **without** an availability flag — a known gap against the "unknown is not zero" rule.
See ADR-002, *Amendment*.

### No history is retained — every Dashboard figure is instantaneous

There is **no** time-series store, snapshot table, or history file anywhere in the project, and
`morgan('dev')` writes to stdout only, so there is no log to parse either. Consequently:

- 14-day traffic charts, trend percentages, sparklines, and period-over-period comparisons **cannot
  be produced honestly**, so their affordances were **removed rather than faked** (`traffic`,
  `renderChart`, and `renderLegend` are deleted; there is no `chartData` or `serverHealth` field).
- There is no `trend`, `trendPercent`, or `delta` field on any `stats[]` entry.
  `stats[].trendAvailable` is **always `false`** and always will be, until a retention decision is
  made deliberately.
- **Every number on the Dashboard is a live measurement at request time.** Refreshing produces new
  readings, never deltas.

### GET /api/fs/tree?path=... → `200`

**Query:** `path` (optional, default `/`) - an existing client-path **directory** to root the response
at. Omitted or `/` behaves exactly as before.

```json
[
  {
    "id": "/",
    "name": "All Files",
    "path": "/",
    "icon": "hardDrive",
    "children": [
      { "id": "/media", "name": "media", "path": "/media", "children": [ /* one more level */ ], "childrenLoaded": true }
    ],
    "childrenLoaded": true
  }
]
```
- Hidden files (dot-prefixed) are excluded; folders sorted by name.
- **Each single response is bounded to exactly two levels below the requested `path`** - unchanged
  from before (`fs.controller.js` `scanChildren` stops recursing at `depth > 2`; pinned by
  `test/api/fs.contract.test.js` and mirrored by `TREE_DEPTH` in `files.js`). What changed:
  **unbounded depth is now reachable** by calling this endpoint again with a deeper node's own
  `path` - every node carries `childrenLoaded`, and `false` means "not read at this bound, call
  back with this node's `path` for the next two levels," not "this folder has no subfolders."
  `true` (even with `children: []`) means the folder really has none, or was unreadable. The
  Files page's tree does this automatically on expand; nothing is a dead end any more, and the
  "you are deeper than the tree" breadcrumb note only means "ask for more," not "go no further."
- A non-existent or non-directory `path` is the caller's error (`404`/`400`), not a silently empty
  tree - unlike a child folder that goes unreadable mid-walk, which degrades to `childrenLoaded:
  true, children: []` the same way it always has.

### GET /api/fs/list → `200`

**Query** (every parameter is validated; nothing is trusted):

| Param | Accepted | Default | Invalid value |
|---|---|---|---|
| `path` | client path | `/` | `400` |
| `page` | integer ≥ 1 | `1` | treated as `1` |
| `limit` | integer ≥ 1 | `20` | clamped to **`200`** (`LIST_MAX_LIMIT`) |
| `sort` | `name` \| `size` \| `modified` \| `downloads` | `modified` | falls back to `modified` |
| `dir` | `asc` \| `desc` | `desc` | anything but `asc` is `desc` |
| `search` | substring of the **name**, case-insensitive; matches in **every subdirectory** of `path`, not just its direct children | — | — |
| `type` | `all` \| `folder` \| `image` \| `video` \| `document` \| `audio` \| `archive` \| `code` \| `other` | `all` | matches nothing |
| `starredOnly` | `true` | off | anything but `true` is off |

**Response:**
```json
{
  "items": [
    {
      "id": "/docs/report.pdf",
      "name": "report.pdf",
      "path": "/docs/report.pdf",
      "isFolder": false,
      "type": "document",
      "size": 48213,
      "modified": 1758500000000,
      "downloads": 7,
      "starred": false,
      "status": "internal"
    }
  ],
  "total": 1,
  "counts": { "all": 1, "folder": 0, "image": 0, "video": 0, "document": 1, "audio": 0, "archive": 0, "code": 0, "other": 0 }
}
```
- **Ordering:** folders always precede files, in both directions — a descending size sort ranks
  files only. Within each group the requested key decides; a missing value (`null`) sorts after
  every real value in both directions; ties break by name, then path. Order never depends on
  `readdir` or on completion order.
- **`type`** is the classification the `type` filter compares against (`folder`, or
  `classifyFile(name)`). The UI renders its badge from it, so a badge cannot disagree with its chip.
- **`size` is the recursive regular-file byte total for a folder** when its bounded walk completes.
  Directory-entry `st_size` (4096 on ext4, 0 on NTFS) is never used. If the walk is truncated or
  encounters an inaccessible subtree, `size` is `null` and `sizeAvailable` is `false`; otherwise
  `sizeAvailable` is `true`. `downloads` is still `null` for folders.
- **`counts`** covers every entry that survived `search` and `starredOnly` (before the `type`
  filter and pagination). `counts.all` equals the sum of every other key, **including `other`** —
  the unclassified bucket is counted, never dropped.
- **Search is recursive** (`FileSystemService.searchTree`): dot-entries and links are skipped, an
  unreadable subtree is skipped, and the walk shares `getTreeStats`' budgets (100k entries / 2 s).
  With `search` set the response adds `searchTruncated` (`true` when a budget stopped the walk, so
  the matches are partial); without `search` the field is absent.
- `total` is the full matching count after the `type` filter; a `page` past the end returns
  `items: []` with the true `total`.
- An entry that vanishes between the directory read and its `stat` (or cannot be stat-ed) is
  skipped and logged; the request still answers `200`. An unreadable **target** directory fails the
  request (`404`/`403`).
- Per-entry enrichment runs with bounded concurrency (`LIST_ENRICH_CONCURRENCY = 16`); the metadata
  store is read once per listing.
- `status` is a constant placeholder (`"internal"`) kept for compatibility; it measures nothing and
  the Files page does not render it.

### GET /api/fs/download?path=...

- Streams `application/octet-stream` attachment; sets `Content-Disposition` (both the quoted
  `filename=` form and the authoritative `filename*=UTF-8''` form), `Content-Length`,
  `Cache-Control: no-cache`.
- The name must satisfy `validateFileName`: a file whose name the rules refuse is `400` with **no**
  header built from it (`api-security-hardening`). This also removes a `500` — Node rejects CR/LF in
  a header value, which a POSIX filename may legally contain.
- Directories: `400`. A symbolic link or junction whose target lies outside the root: `403`.
  Increment download counter on stream open (fire-and-forget).
- Never use it as an image source: the forced octet-stream type is deliberate (it stops untrusted
  content rendering inline). Previews have their own endpoint.

### GET /api/fs/thumbnail/capability → `200`

`{ "available": false, "formats": [], "maxSize": 512 }` — `available` is `true` only when an image
transformer (`sharp`) is installed; this repository installs none, so as shipped previews are
unavailable and the UI says so. `formats` lists the extensions a preview can be produced for.

### GET /api/fs/thumbnail?path=...&size=...

Read-only. `size` is the long edge in pixels, clamped to `16..512` (default `256`); non-integer
`size` is `400`. On success: `200`, `image/webp`, bounded in both dimensions, never the original
bytes. Otherwise an error envelope with the explicit marker header **`X-Preview: unavailable`**:

| Status | When |
|---|---|
| `415` | Not a previewable raster format (decided from the **name**, before any byte is read; SVG is refused) or a folder |
| `404` | No transformer installed |
| `413` | Source larger than 50 MiB |
| `422` | The image could not be decoded |
| `403` | Path traversal |

### POST /api/fs/folder

**Body:** `{ "path": "/media/new-folder" }` → **`201`**
```json
{ "success": true, "data": { "path": "/media/new-folder" } }
```
Errors: `400` invalid name/path · `404` parent missing · `409` name exists.

### POST /api/fs/upload

`multipart/form-data` fields:

| Field | Required | Meaning |
|---|---|---|
| `destination` | no (default `/`) | Existing folder, client path |
| `overwrite` | no | `"true"` replaces an existing **file**; anything else (including absent) refuses with `409` |
| `file` | yes | One file |

**Multipart field order is load-bearing — send `destination` and `overwrite` BEFORE `file`.**
Multer resolves the storage destination when the first file chunk arrives, so a field sent after
the file part has not been parsed at that moment. The server now stages the bytes in a hidden
`.upload-<random>.part` file and decides the final location only after the whole body is parsed, so
a late `destination` is still honoured rather than misfiled — but a destination sent first is
validated **before any byte is written**, and every client in this repository sends it first.

→ **`201`**
```json
{ "success": true, "data": { "name": "a.pdf", "path": "/docs/a.pdf", "size": 48213 } }
```
- `data.path` is the path the file was actually written to, derived from the resolved destination
  — never from a form field re-read after the fact.
- `overwrite` refusal is atomic (`link()`, exclusive-copy fallback); replacement is a single
  `rename()`. A failed or refused upload leaves no staged or partial file and never touches an
  existing file. A name held by a folder is always `409`.
- **Size limit:** `UPLOAD_MAX_BYTES` environment variable (positive integer bytes), default
  **5 GiB**. Larger files fail with `413` naming the limit; the partial file is removed.

Errors (static messages, no absolute path): `400` no file / destination missing / destination not a
folder / invalid filename · `403` destination outside the root · `409` name exists (or held by a
folder) · `413` too large.

Placement semantics are owned by the shared `upload-destination-integrity` capability
(`openspec/changes/files-page-correctness`); they are not restated here.

#### Failure classes and kinds (consumed by the Upload page)

| Class | Status | Kind the page uses | Where the kind comes from |
|---|---|---|---|
| Name collision, `overwrite` not `"true"` | `409` | `conflict` | status |
| File over `UPLOAD_MAX_BYTES` | `413` | `too-large` | status (message names the limit in bytes) |
| Destination outside the root / access refused | `403` | `forbidden` | status |
| Unmapped server failure | `5xx` | `server` | status |
| No response (connection dropped) | — | `network` | transport (`api.js`) |
| Aborted by the operator (pause / cancel) | — | `aborted` | transport (`api.js`); never shown as a failure |
| Rejected name · missing destination · destination not a folder | `400` | *none* | — |

- **The server sends no `kind` field today.** The three `400` classes therefore share one status and
  are not distinguishable by a machine-readable signal; the page shows the server's own authored
  message for them rather than guessing. If the error body later carries a string `kind`, `api.js`
  attaches it to the rejected `Error` (`err.kind`) and it takes precedence over the status. The page
  never derives a kind from the human-readable message.
- `api.js` attaches `err.status` (HTTP status; `0` when no response arrived) to every rejected
  request, and `err.kind` when one is known. Additive: no signature or return shape changed.
- Kinds are short stable tokens (`^[a-z][a-z-]*$`), never reworded with the message.

#### Destination check and creation (Upload page)

The page checks a destination once before sending anything to it, with
`GET /api/fs/list?path=<dest>&limit=1`: `200` usable · `404` does not exist · `400` not a folder ·
`403` access refused · anything else "could not be checked". Items whose destination fails the check
are **held** under one notice — not failed one by one. A missing destination may be created on the
operator's request with the existing `POST /api/fs/folder` (non-recursive: a missing parent is a
`404`). **An upload never creates a directory as a side effect.** If an item later fails with a
`400`/`403`/`404`, the page re-checks its destination once; if it has become unusable the item carries
the destination reason and the remaining items for it are held rather than retried blindly. Write
permission cannot be probed without an upload, so "cannot be written to" is reported from a `403`.

### POST /api/fs/star

**Body:** `{ "path": "/docs/a.pdf", "starred"?: boolean }` → **`200`**
```json
{ "success": true, "data": { "path": "/docs/a.pdf", "starred": true } }
```
Without `starred` each call toggles once; with it the call is idempotent (sets that value).
`data.starred` is the value actually stored. Errors: `400` missing path or non-boolean `starred` ·
`404` path does not exist.

### PUT /api/fs/rename

**Body:** `{ "oldPath": "/docs/old.txt", "newName": "new.txt" }` (name only — no path) → **`200`**
```json
{ "success": true, "data": { "oldPath": "/docs/old.txt", "newPath": "/docs/new.txt" } }
```
Errors: `404` source missing · `409` target exists · `400` invalid name. Metadata keys migrate
best-effort after disk rename.

### PUT /api/fs/move

**Body:** `{ "paths": ["/a.txt", "/b folder"], "destination": "/archive" }` (≤500 paths) → **`200`**
```json
{
  "success": true,
  "data": {
    "moved": [ { "oldPath": "/a.txt", "newPath": "/archive/a.txt" } ],
    "failed": [ { "path": "/b folder", "error": "An item with this name already exists at the destination.", "statusCode": 409 } ]
  }
}
```
- Cross-directory by design — unlike `PUT /api/fs/rename`, which stays same-directory only (see its own
  entry above). The name is kept as-is; only the parent changes.
- The destination must already **exist and be a directory** — there is no implicit creation; create it
  first with `POST /api/fs/folder`.
- **A `200` (and `success: true`) does NOT mean every path was moved.** Same partial-failure contract as
  `DELETE /api/fs/delete`: read `data.moved` / `data.failed`, never assume the full batch landed.
- Total failure (`moved` empty, `failed` non-empty) is a non-2xx: the first error with its status.
- Errors per item: `404` source or destination missing · `409` name collision at the destination · `400`
  destination is not a folder, or the destination is the item itself or one of its own subfolders · `403`
  moving the storage root itself. Metadata keys and a governed path's access policy migrate best-effort,
  exactly like a rename (`MetadataService.renamePath` / `FileAccessPolicyService.onPathRenamed`).

### POST /api/fs/copy

**Body:** `{ "paths": ["/a.txt", "/b folder"], "destination": "/archive" }` (≤500 paths) → **`200`**
```json
{
  "success": true,
  "data": {
    "copied": [ { "sourcePath": "/a.txt", "newPath": "/archive/a.txt" } ],
    "failed": [ { "path": "/b folder", "error": "An item with this name already exists at the destination.", "statusCode": 409 } ]
  }
}
```
- Leaves the source in place — unlike `PUT /api/fs/move`. Same destination rules otherwise: must already
  **exist and be a directory** (no implicit creation), cannot be the item itself or one of its own
  subfolders, and a name collision at the destination is refused rather than overwritten.
- **There is no "already there" no-op.** Copying onto the item's own name — including pasting into the
  same folder it is already in — is just a name collision (`409`); unlike move, copy never has a sensible
  no-op case, so this is not special-cased.
- Same partial-failure contract as `PUT /api/fs/move` / `DELETE /api/fs/delete`: read `data.copied` /
  `data.failed`; total failure (`copied` empty, `failed` non-empty) is a non-2xx with the first error.
- Errors per item: `404` source or destination missing · `409` name collision at the destination · `400`
  destination is not a folder, or is the item itself or one of its own subfolders · `403` permission
  denied. **No metadata or access-policy migration** - a copy is a new item (zero downloads, no star, no
  policy), not the same item relocated, so `MetadataService.renamePath`/`FileAccessPolicyService.onPathRenamed`
  are deliberately not called here.

### DELETE /api/fs/delete

**Body:** `{ "paths": ["/a.txt", "/b folder"] }` (≤500) → **`200`**
```json
{
  "success": true,
  "data": {
    "deleted": ["/a.txt"],
    "failed": [ { "path": "/b folder", "error": "Item not found: /b folder", "statusCode": 404 } ]
  }
}
```
- **A `200` (and `success: true`) does NOT mean every path was deleted.** Per-item failure never
  aborts the batch; survivors are listed in `data.failed` with a reason. A client must read
  `data.deleted` / `data.failed` and report a partial failure as one — the count of deleted items is
  `data.deleted.length`, never the number of paths sent.
- Total failure (`deleted` empty, `failed` non-empty) is a non-2xx: the first error with its status.
- Deletion is **permanent** (recursive `fs.rm`): there is no trash and no restore.
- Errors: `400` empty/oversized batch.

### POST /api/fs/download-zip

**Body:** `{ "paths": [...] }` — JSON, or form-urlencoded with `paths` as a JSON string (the SPA
posts a hidden form targeted at a hidden iframe, so the page never navigates). → **`200`**
`application/zip` stream, `Content-Disposition: attachment; filename="download-YYYY-MM-DD.zip"`.
- 1–500 paths; empty or more than 500 is `400`.
- Every path is validated **before** the first byte is streamed: a traversing path is `403` and no
  archive is produced.
- A directory becomes a recursive folder entry under its own name. Download counters increment for
  files only.

### GET /api/settings → `200`

Read-only aggregate over the operator settings document. **Bare object, no envelope** (see
*Conventions → Success shape*): a client reads `settings.general.workspaceName` directly — there is
no `success` field and nothing to unwrap.

```json
{
  "general": { "workspaceName": null, "defaultUploadFolder": null },
  "appearance": { "defaultView": null }
}
```

That is the **complete schema**, and it is exactly these three keys — there is no `version` field,
no free-form section, no theme key, and no room for anything else.

| Field | Type | Nullable | Meaning |
|---|---|---|---|
| `general.workspaceName` | `string` | yes — `null` is the explicit *unset* state | Rendered as the sidebar brand text (`app.js`). ≤ 60 characters after trimming. |
| `general.defaultUploadFolder` | `string` | yes — `null` is unset | A **client path** (POSIX, rooted at `/`). Validated and stored; **not yet read by any page** — the Uploads page still starts at `/` |
| `appearance.defaultView` | `string` | yes — `null` is unset | `"list"` \| `"grid"` — the layout a *fresh* visit to All Files opens in. |

- **A missing store bootstraps itself on first read.** `SettingsService._read` sees `ENOENT`,
  creates `data/` (recursive `mkdir` **before** the write — the ordering rule `MetadataService._init`
  documents), writes the document above, and serves it from the in-memory cache. There is no setup
  step, no migration and no seed fixture.
- **`null` is the unset state, not a missing value.** Every key is always present. A consumer that
  receives `null` falls back to its own default — that is why the three fields are nullable rather
  than absent, and why a falsy value is never rendered as `""` or `"undefined"`.
- **Values are client paths, never host paths.** `defaultUploadFolder` is stored verbatim as sent;
  the settings layer does not resolve it (see `PUT /api/settings`).
- **One disk read per process:** the document is cached in memory after the first read, so the three
  silent frontend consumers below cost nothing but a cache hit.
- **A corrupt or unreadable store fails the whole request with `500`** —
  `AppError('Settings store could not be read', 500)` from `SettingsService._read`, serialized by
  `errorHandler` as `{ "success": false, "error": … }`. This is a **deliberate per-capability
  choice, not the degraded-200 dashboard pattern**: substituting defaults would silently discard real
  operator configuration, and the file is small and hand-repairable. Do not extend the degradation
  pattern to this store without a decision of its own. See ADR-006.

**Consumers.** Every read of this endpoint is **silent** (`api.js` `{ silent: true }`) and every
consumer degrades independently: a store failure changes that one enhancement and nothing else, and
never raises a toast for the settings read alone.

| Consumer | Reads | Effect | Unset / unreachable |
|---|---|---|---|
| `app.js` — `loadGlobalData()` → `applyWorkspaceName()` | `general.workspaceName` | Writes `.brand-name` `textContent` in the shared sidebar on **all four pages**. Pure text write; the sidebar markup is never edited, so the four sidebars stay byte-identical. | The static markup default (`Dimension`) stands; no toast, no console line. |
| `files.js` — `applyDefaultViewSetting()` | `appearance.defaultView` | Sets the initial list/grid layout of a **fresh** visit to All Files. Suppressed by an explicit view choice, which that page persists as `Store 'files-view'` — checked both before and after the read. | The page's existing default; no toast, no console line. |
| `settings.js` — `loadSettings()` | the whole document | Hydrates the form (every control named in `settings.html` has a `name`/`data-name` matching its key). | The on-page notice is shown and **Save/Discard explain instead of writing**. |

`general.defaultUploadFolder` is validated and persisted but has **no consumer yet** — the Uploads
page still starts at `/`. Do not describe it as prefilling the destination until a page reads it.

### PUT /api/settings → `200`

**Strict, validated full replace** — not a merge, not a patch. The body must be the *complete*
document; validation happens in `SettingsService.replace()` **before** any write, so a rejected
payload leaves the stored file byte-identical.

**Body:**
```json
{
  "general": { "workspaceName": "Acme", "defaultUploadFolder": "/incoming" },
  "appearance": { "defaultView": "grid" }
}
```

→ **`200`**
```json
{
  "success": true,
  "settings": {
    "general": { "workspaceName": "Acme", "defaultUploadFolder": "/incoming" },
    "appearance": { "defaultView": "grid" }
  }
}
```

`settings` is the **persisted, normalized** document, so a client never has to reimplement the
trim / `""`→`null` rules to learn what was actually stored.

| Rule | Accepted | Refusal (`400 { success: false, error }`) |
|---|---|---|
| Top level | exactly `general` and `appearance` | any other section → `Unknown settings section "…"` |
| `general` | object carrying exactly `workspaceName` and `defaultUploadFolder`, **both present** | missing key → `Missing setting "general.…"`; extra key → `Unknown setting "general.…"` |
| `general.workspaceName` | `null`, or a string of at most **60 characters after trimming**; `""` / whitespace-only normalizes to `null` | non-string (except `null`), or > 60 chars |
| `general.defaultUploadFolder` | `null`, or a **client path**: passes `validateClientPath`, starts with `/`, contains no `\`, and **every segment** passes `validateFileName` | host-absolute path, `..`, dot segments, control or Windows-illegal characters, empty string, > 4096 chars |
| `appearance` | object carrying exactly `defaultView`, present | missing key → `Missing setting "appearance.…"`; extra key → `Unknown setting "appearance.…"` |
| `appearance.defaultView` | `null`, `"list"`, `"grid"` | anything else |
| Whole body | a JSON **object** | absent body, array, string, number |

- **Unknown keys are rejected, never silently stripped.** Stripping would hide client drift behind a
  successful-looking full replace: a client still sending a removed pane would get a `200` and drop
  the values it sent.
- **A malformed JSON body is a client `400`, not a server `500`** — the body parser's own error
  status is honoured and its parser text is replaced by the generic `errorHandler` message.
- **A rejected write leaves the store byte-identical** — validation precedes the write, and the write
  itself is **atomic** (temp file + `rename`), so no partially written document is ever observable at
  `data/settings.json`.
- **`defaultUploadFolder` is validated but never resolved.** The settings layer imports no
  `PathService` and touches no filesystem object other than the store file; resolution through the
  secure path boundary happens at the point of use, exactly like every other client path.
- **No credential may ever be added to this document** (ADR-006). It is unauthenticated over HTTP and
  world-readable on disk like `data/metadata.json`; its contents are operator-preference values only.

**There is deliberately no `POST /api/settings/action`** — nor a `DELETE`, nor a reset endpoint. The
Settings page holds no destructive control, and adding an unauthenticated destructive endpoint is
out of scope by design (ADR-003, ADR-006). Any other method or sub-path under `/api/settings` falls
through to the `/api` catch-all:

```json
{ "success": false, "error": "API endpoint not found" }   // 404
```

**Mount order (load-bearing).** The settings router is mounted at `/settings` inside the single
assembly `src/routes/api.js`, which `server.js` mounts once **before** the `/api` 404 catch-all —
that catch-all is a two-argument middleware which never calls `next()`, so a mount placed after it
is permanently unreachable and `GET /api/settings` would answer `404` even though the router
exists. Pinned by `test/api/settings.contract.test.js`.

## Admin endpoints (ADR-009 phase 2)

Mounted at `/api/admin` (and `/api/v1/admin`), served by `src/routes/admin.routes.js`. Every route
here requires a session (like everything except `/health` and `/auth/login`) **and** `req.user.role
=== 'admin'` — a non-admin session gets `403`, not `401`; no session at all still gets `401` first
(the blanket `authenticate` in `src/routes/api.js` runs before this router's `requireAdmin`). There
is no per-route permission catalogue — one role check gates the whole router (identity/rbac-lite
spec).

**What a policy does.** Policies govern the **File Portal** (files-server-web) only. This app never
consults them: every `/fs` endpoint, the thumbnail and the dashboard serve every signed-in account the
whole storage root, whatever policies exist. The portal reads `admin.sqlite` read-only and decides
per path and per caller (a visitor who is not signed in, or a signed-in portal user):

- **Levels:** `view` (listed in browse, search, categories, releases and the navbar, marked
  `viewOnly`) < `download` (also downloaded, hashed, zipped, served as `/release{8,9}/latest`).
- **Per policy:** unpublished, before `available_from` or after `available_until` (both inclusive),
  or a deny for the user or any of their groups → **hidden**. A visitor: `is_locked` → **locked** (the
  name is shown with a lock and a sign-in prompt), `public` → the `default_level`, otherwise hidden. A
  signed-in user: `restricted` → the highest level granted to them or one of their groups (none →
  hidden); `authenticated`/`public` → the `default_level`, raised by a grant. `is_locked` does not
  affect signed-in users.
- **Over the path** (the item and every ancestor folder): hidden beats locked beats the **lowest**
  level, so a folder caps everything inside it. No policy → download. **Administrators get no bypass
  on the portal.**
- Rows written before levels existed (migration 4) default to `download`, which is what they meant.

The portal endpoints and their responses are documented in files-server-web
`docs/integration-admin-files-manager.md`. `GET /api/admin/files/effective` runs the same rules here
(`FileAccessPolicyService.portalAccess`) for the admin's "Check access" tool. Renaming, moving or
deleting a file or folder in this app carries its policies, and those **below** it, along
(best-effort, `onPathRenamed`/`onPathDeleted`), so a portal policy never strands on a dead path.

Data model, constraints and lifecycle: `docs/DATABASE.md`. Every mutating admin call — success
**and** failure — writes one `audit_logs` row (action names in `docs/DATABASE.md` → *Action
vocabulary*). There is no endpoint that reads the audit log yet.

Common errors on every route below: `401` no/expired session, `403 "Administrator access
required."` for a non-admin session, `403 "Missing or invalid CSRF token."` on a non-GET without the
token, `429` from the general limiter.

### User management

**User object** (every response that returns a user; `password_hash`, `failed_login_count` and
`locked_until` are stripped by `UserService._publicShape`, never by the controller):

```json
{ "id": 2, "username": "alice", "email": "alice@example.com", "role": "user", "status": "active",
  "created_at": 1760400000000, "updated_at": 1760400000000 }
```

`:id` is parsed with `Number()`; a non-numeric id finds no row and answers `404 "User not found."`.

| Endpoint | Envelope | Notes |
|---|---|---|
| `GET /api/admin/users` | bare array | User objects ordered by `created_at` ascending. |
| `POST /api/admin/users` → `201` | `{success, user}` | Body: `{username, password, email?, role?}`. `username` trimmed, required (`400`); `password` ≥ 8 characters (`400`); `role` `"admin"`\|`"user"`, default `"user"` (`400` otherwise); `409` on a duplicate username (case-insensitive). `email` is optional and blank becomes `null`; a duplicate email violates the `UNIQUE` constraint and surfaces as a masked `500` (no pre-check). |
| `POST /api/admin/users/:id/status` | `{success, user}` | Body: `{status: "active"\|"disabled"}` (`400` otherwise, `404` unknown id). Disabling revokes every active session for that user immediately (`SessionService.revokeAllForUser`). |
| `POST /api/admin/users/:id/reset-password` | `{success, user}` | Body: `{password}` (≥ 8, `400`). Also revokes every active session for that user — a reset password must not leave an old session usable. Does **not** clear an active lockout. |
| `POST /api/admin/users/:id/revoke-sessions` | `{success: true}` | Ends every active session for that user without touching `status`. Succeeds (no-op) for an unknown id. |
| `DELETE /api/admin/users/:id` | `{success: true}` | `404` unknown id. Its own sessions and permission rows go via `ON DELETE CASCADE`. **Known defect:** a user referenced by `audit_logs.actor_id` or by a policy's `created_by`/`updated_by`/`granted_by` cannot be deleted — the foreign key has no `ON DELETE` action, so the request fails with a masked `500` (see `docs/DATABASE.md`). |

> [!WARNING]
> There is no last-admin guard: an admin can disable or delete themselves, or the last active
> admin, and lock everyone out of this router.

### File access policies

**Policy object** (`GET …/policy`, `GET …/policies` rows, `PUT …/policy` response): the joined
`files` + `file_access_policies` row, snake_case, booleans as `0`/`1`, times in epoch ms:

```json
{ "file_id": 3, "client_path": "/reports/q3.pdf", "is_directory": 0,
  "policy_id": 3, "access_mode": "restricted", "is_published": 0, "is_locked": 1,
  "available_from": null, "available_until": 1767225600000,
  "created_by": 1, "updated_by": 1, "created_at": 1760400000000, "updated_at": 1760400000000 }
```

Policy objects also carry `"default_level"` (`view`|`download`, default `download`).

**Permission object:** `{ "id", "file_id", "user_id", "permission": "grant"|"deny", "level", "granted_by", "created_at" }`.
**Group permission object:** the same with `group_id` and `group_name` in place of `user_id`.
`level` is ignored for a deny.

Validation (`FileAccessPolicyService`): `path` must pass `validateClientPath` (`400`);
`accessMode` ∈ `public`/`authenticated`/`restricted`; `availableFrom`/`availableUntil` are
safe-integer epoch ms or `null`, and `from ≤ until`; `permission` ∈ `grant`/`deny`; `defaultLevel`
and `level` ∈ `view`/`download` — all `400`
otherwise. The path is **not** checked against the disk: a policy can be set on a path that does
not exist. Request field names are camelCase; response fields are the snake_case column names.

| Endpoint | Envelope | Notes |
|---|---|---|
| `GET /api/admin/files/policies` | bare array | Only paths with a policy — sparse, not a mirror of `STORAGE_ROOT` (design D2). |
| `GET /api/admin/files/policy?path=...` | bare object or `null` | `null` means no policy exists for that path. |
| `PUT /api/admin/files/policy` | `{success, policy}` | Body: `{path, isDirectory?, accessMode?, isPublished?, isLocked?, availableFrom?, availableUntil?, defaultLevel?}`. Creates the `files`+`file_access_policies` rows on first call, **updates in place** on a later call for the same path — never a duplicate row. Omitted fields keep their current value (or the documented default on first creation: `access_mode="restricted"`, both flags `false`). |
| `DELETE /api/admin/files/policy?path=...` | `{success: true}` | Removes the policy and (via `ON DELETE CASCADE`) every per-user permission on that file. |
| `GET /api/admin/files/permissions?path=...` | bare array | `[]` if the path has a policy but no per-user rows. |
| `POST /api/admin/files/permissions` → `201` | `{success, permission}` | Body: `{path, userId \| groupId, permission: "grant"\|"deny", level?}` — `level` defaults to `download` (what a grant meant before levels). `409` if `path` has no policy yet — grant before policy is a user error, not an implicit policy creation. One row per `(file, user)` / `(file, group)`; a second grant for the same pair updates the existing row. `404` for an unknown user or group. |
| `DELETE /api/admin/files/permissions` | `{success: true}` | Body: `{path, userId \| groupId}`. |
| `GET /api/admin/files/group-permissions?path=...` | bare array | Group permission objects, by group name. |
| `GET /api/admin/files/effective?path=...&userId=...` | bare object | `{outcome: "download"\|"view"\|"locked"\|"hidden"\|"disabled", policies: [{path, outcome}]}` — the File Portal's decision and what each governing policy gave (for any portal whose `FILES_ROOT` contains the path). Omit `userId` for a visitor who is not signed in. |

### Groups

A group is a named set of users that one file grant can cover; it carries no capability of its own
and never changes a role. **Group object:** `{ "id", "name", "description", "created_at",
"updated_at", "members": [{ "id", "username" }] }`. Names are 1-64 characters, unique
case-insensitively (`409`); descriptions at most 200 (`400`). Audited as `group.create`,
`group.update`, `group.delete`, `group.members` (`target_type = 'group'`).

| Endpoint | Envelope | Notes |
|---|---|---|
| `GET /api/admin/groups` | bare array | Ordered by name; members inline. |
| `POST /api/admin/groups` → `201` | `{success, group}` | Body: `{name, description?}`. |
| `PUT /api/admin/groups/:id` | `{success, group}` | Body: `{name?, description?}`; `404` unknown id. |
| `DELETE /api/admin/groups/:id` | `{success: true}` | Memberships and every group grant go with it (cascade). |
| `PUT /api/admin/groups/:id/members` | `{success, group}` | Body: `{userIds: number[]}` — **full replace**; `404` if any id is not a user. |

A governed path's `files.client_path` row is kept in step with `PUT /api/fs/rename`, `PUT
/api/fs/move` and `DELETE /api/fs/delete` on a **best-effort** basis
(`FileAccessPolicyService.onPathRenamed`/`onPathDeleted`, called from `fs.controller.js` alongside
the existing `MetadataService` fire-and-forget calls) — the filesystem operation's own success
never depends on it.

### File portal and logs (`system.controller.js`, `PortalService`)

The two apps share logical values only, in `admin.sqlite` (ADR-010). This app never reads or
writes a portal file except the trace log named by `PORTAL_LOG_FILE`. `PORTAL_ROOT` is retired:
if set, it is logged as ignored at startup.

**Storage volume markers.** On first start, when the database holds no `volume_id`, this app gives
`STORAGE_ROOT` an identity. It adopts a valid existing `.dimension-volume`, or creates one
(`{"volumeId":"<uuid>","clientPath":"/"}`, never overwriting) and stores the same UUID. A stored id
is never re-stamped. **A portal locates itself:** it climbs from its `FILES_ROOT` to that marker and
decides every path as `<the folder it found itself in>/<rel>`. So `FILES_ROOT` may be this storage
or any folder in it, from any mount point, with nothing configured here. Policies apply exactly as
in this app's view. The optional **portal folder** (e.g. `/Downloads`) only serves portal hosts that
cannot see the storage root: the same file in that folder names it
(`{"volumeId":"<uuid>","clientPath":"/Downloads"}`), and those hosts trust it. Markers are reserved at
any depth: `PathService.resolveSecurePath` answers `404` for them (any case, trailing dots/spaces,
`:$DATA` suffix), so no `/fs` endpoint can download, rename, move, copy or delete one, and as dot
entries they are never listed or counted. A rename or move of the portal folder or the release folder
(or one of their ancestors) through the API rewrites the stored paths and the marker's `clientPath`.

| Endpoint | Envelope | Notes |
|---|---|---|
| `GET /api/admin/portal/settings` | bare `{volume: {id, status}, portalRoot: {clientPath, status}, releaseClientPath, auth: {sessionMinutes, maxFailedAttempts, lockoutMinutes}}` | `volume.status` is read live: `ok`, `missing` (stored id, no marker), `mismatch` (marker of another volume, or unreadable), `unwritable` (no id could be stamped). `portalRoot.clientPath` is the published portal folder, `null` for none (portals that see the storage root need none); its status is `ok`, `missing` (folder gone), `mismatch` (another volume's marker there) or `unverified` (volume not `ok`). A missing folder marker is rewritten on this read once the volume is `ok`. `releaseClientPath` is `null` or `"/a/b"`. An `auth` value is `null` when unset (the portal's own env/default applies). |
| `PUT /api/admin/portal/settings` | `{success, ...the GET document}` | Strict full replace of `{portalRootClientPath, releaseClientPath, auth}`; `null` clears. `400`: unknown key (including `volume`), a missing field, an `auth` value not `null` and not a whole number in range (minutes 1–10080, attempts 1–1000), a folder that is `/`, has `.`/`..` or is not a folder. The two folders are not checked against each other (each portal uses the release folder only inside itself). `404`: a folder missing. `409`: a new portal folder while `volume.status` is not `ok`, or a folder holding another volume's marker. Paths normalized like navbar folders (`release\pvm/` → `/release/pvm`). A new portal folder gets the marker `{volumeId, clientPath}` before the settings are stored; the previous one's marker is removed afterwards (the storage-root marker never is). Audited as `portal.settings`. The portal applies it within its `ADMIN_SYNC_TTL_MS` (no restart). |
| `GET /api/admin/portal/config` | bare `{available: false, reason, values: null}` | **Retired** (ADR-010). Always this "not linked" shape; `reason` names `/api/v1/admin/portal/settings`. Kept so no v1 response is retyped (ADR-007). |
| `PUT /api/admin/portal/config` | error | **Retired.** Always `503`, writes nothing. |
| `GET /api/admin/logs/portal?limit=` | bare `{available, entries}` | Parsed JSON lines from `PORTAL_LOG_FILE` (absolute; the same file as the portal's `LOG_FILE`), newest first, `limit` 1–1000 (default 200), only the last 512 KiB read. Entry: `{t, level: "info"|"warn"|"error", msg, method?, status?, url?}`. A missing file is `entries: []`. Unset, relative or a directory: `available: false` with a `reason`, never an empty list passed off as a reading. |
| `GET /api/admin/logs/audit?limit=` | bare array | `audit_logs` rows plus `actor_username` (`null` for a deleted or absent actor), newest first, `limit` 1–1000 (default 200). |

`GET /api/auth/me` additionally carries `appVersion` (additive): `APP_VERSION` when set, else the
`package.json` version. The sidebar renders it as the version label.

## Error Model

| Status | Meaning | Typical triggers |
|---|---|---|
| `400` | Invalid input | Bad name/path, no file, non-directory for readDir/download, empty batch, **any invalid `PUT /api/settings` payload (unknown key, missing key, wrong type, out-of-enum, over-long, bad client path)**, invalid admin user/policy field |
| `401` | Unauthenticated | No, expired or revoked session (`"Authentication required."`); failed login (`"Invalid username or password."`) |
| `403` | Forbidden | Path traversal attempt; storage-root deletion; OS permission denial (`EACCES`/`EPERM`); missing/wrong `X-CSRF-Token` on a non-GET; non-admin session on `/admin/*` |
| `404` | Not found | Missing item/parent, `ENOENT` |
| `409` | Conflict | Create/rename/upload collides with an existing item |
| `413` | Too large | Upload over `UPLOAD_MAX_BYTES`; preview source over 50 MiB |
| `415` | Unsupported | Preview requested for a non-image or a folder |
| `422` | Unprocessable | Preview could not be decoded |
| `429` | Too many requests | General `/api` limiter (60 writes / 600 reads per minute per IP, `AFM_RATE_LIMIT_*_PER_MINUTE`), login throttle, or too many concurrent uploads (`AFM_UPLOAD_MAX_CONCURRENT`). Rate-limit refusals carry `Retry-After` (seconds) |
| `507` | Insufficient storage | Upload refused because free space is below `AFM_UPLOAD_FREE_SPACE_BYTES`, before any byte is staged |
| `500` | Server error | Unmapped fs error. Message masked to a generic string. Also raised explicitly by a **corrupt or uninitializable `data/settings.json`** (`SettingsService` → static authored message) |

All errors are produced by throwing `AppError(message, statusCode)` and are serialized centrally by
`src/middlewares/errorHandler.js`. Only `AppError` messages reach the client; no `stack` is sent in
any environment.

**Error-disclosure rule (every endpoint, not only upload).**
- No `stack` field in **any** environment — including an unset `NODE_ENV`, which `env.js` still reads
  as `development`. There is no disclosure switch to set, and none should be added (ADR-004).
- An authored `AppError` message is forwarded verbatim (it carries no path, errno or system detail).
- Every other failure gets a fixed generic message **whatever its status**: `"Request could not be
  processed."` below 500, `"An unexpected error occurred on the server."` at 500+. A framework `400`
  (e.g. malformed JSON) does not leak its parser text.
- The server log (`console.error` in `errorHandler`) keeps the full error and its stack, so diagnosis
  is not lost. Pinned by `test/api/upload.surface.test.js` and `test/integration/error-disclosure.test.js`.

### Error contract — stable within v1 (ADR-007)

- **Envelope:** `{ "success": false, "error": string }`, non-empty `error`, nothing else required.
  It does not change within v1; `/api/v1` and `/api` fail identically under identical conditions.
- **Status meanings** are the table above, chosen by the failing condition. An unknown endpoint is
  `404` in the envelope, never an HTML page.
- **`kind` — reserved, not emitted.** The envelope reserves an optional string `kind`, a stable
  machine-readable token matching `^[a-z][a-z-]*$` (not a rewording of `error`). **No endpoint sends
  it today** (`src/` contains no producer; pinned). Its absence is valid: classify by status alone,
  and never infer a kind from the message. When present it takes precedence over the status. Adding
  it to an endpoint later is additive. `api.js` attaches `err.status` (`0` on transport failure) to
  every rejection and copies `err.kind` only when the body carries a string `kind`; the transport
  itself tags `network` / `aborted` on uploads.
- **No disclosure, every endpoint:** no stack, absolute path, drive letter, UNC/backslash path or raw
  errno text in any error body, in any environment (the Dashboard-scoped rule in
  `filesystem-security` is the narrower original). Pinned for the versioned prefix by
  `test/api/versioning.contract.test.js`.

**Exception:** the two Dashboard endpoints do **not** follow this model. They answer `200` with
per-capability degradation, so a partial failure is expressed in the payload
(`volumeAvailable: false`, `truncated: true`, empty arrays) rather than in a status code. See
*Failure semantics* under `GET /api/dashboard/summary`.

## Data Schemas

The JSON document shapes below are API-adjacent contracts. The SQLite admin database
(`admin.sqlite`: users, sessions, audit log, file-access policies), the store mechanics and
operational notes for all three stores are in **`docs/DATABASE.md`**.

### `data/metadata.json` (MetadataService)

```json
{
  "downloads": { "/docs/a.pdf": 3 },
  "starred": ["/docs/a.pdf"],
  "activities": [
    { "type": "upload|folder|edit|delete", "user": "system", "action": "uploaded", "target": "a.pdf", "folder": "/docs", "time": 1758500000000 }
  ]
}
```
- Written atomically (temp file + rename); cached in memory (singleton instance).
- `activities` capped at 50 entries. Keys in `downloads` / entries in `starred` are client paths;
  they are migrated on rename and removed on delete (best-effort).

### `data/settings.json` (SettingsService)

```json
{
  "general": { "workspaceName": null, "defaultUploadFolder": null },
  "appearance": { "defaultView": null }
}
```

- **A separate store from the metadata DB** — settings are not new keys in `data/metadata.json`, and
  `MetadataService` is untouched by the settings work.
- Written atomically (temp file + rename); cached in memory (singleton instance); created with the
  defaults above on the first read of a missing file (`data/` is created first).
- **Client values only.** `defaultUploadFolder` is a client path, validated by `validateClientPath` +
  per-segment `validateFileName`; the settings layer never resolves it to a host path and no absolute
  OS path is ever written or returned.
- **No credential, token or key may ever live here** (ADR-006): any session can read it over HTTP
  (there is no per-key authorization) and it is plain JSON on disk, same exposure class as
  `data/metadata.json`. Secrets belong in the environment file; identity data in `admin.sqlite`.
- A corrupt/unparseable file is **not** repaired or defaulted: `_read` throws `AppError(500)` and the
  request fails wholly (ADR-006).
- Git-ignored by the existing `data/*.json` rule.

### File item (API + frontend)

`{ id, name, path, isFolder, type, size, modified, downloads, starred, status }` — `id === path` is
the client path and doubles as the stable identifier across API and UI. `size` and `downloads` are
`null` for folders.

### Frontend module registry (window globals)

| Global | Source | Responsibility |
|---|---|---|
| `API` | `assets/js/api.js` | `get/post/put/del/upload/downloadFile/downloadMultipleFiles/downloadZip/thumbnailUrl`, `BASE_URL` (resolved once, read-only; the object is frozen). The single frontend egress — see *API versioning* |
| `Files` | `assets/js/files.js` | Files page; `Files.pure` (renderers/helpers) and `Files._controller` are test seams |
| `Uploads` | `assets/js/uploads.js` | Upload page; `Uploads.pure` (derivations, row renderer) and `Uploads._controller` are test seams |
| `AFM` | `assets/js/app.js` | Shared helpers namespace (`Toast`, `Modal`, `Format`, `Icons`, DOM utils, `applyWorkspaceName`) |
| `Icons` / `icon()` / `hydrateIcons()` | `assets/js/app.js` | Inline SVG system (`<i data-icon="name">`) |
| `Format` | `assets/js/app.js` | bytes/duration/relative-time/number formatters |
| `Toast`, `Modal`, `Dropdown`, `ContextMenu` | `assets/js/app.js` | UI primitives |
| `theme.js` | self-contained | Applies `[data-theme]` before paint; no dependencies. `Theme.refresh()` re-syncs swapped-in toggles |
| `Router` | `assets/js/router.js` | Client-side navigation between the four pages (`navigate`, `resolve`); see below |
| `Dashboard`, `Settings` | `assets/js/dashboard.js`, `assets/js/settings.js` | Page modules. `Settings` reads and writes the live `GET`/`PUT /api/settings` store; the theme picker is **not** its concern |
| `AFM.Notifications` | `assets/js/notifications.js` | Shared bell panel: opens on the topbar bell, renders the real `GET /api/dashboard/summary` activity feed with loading/empty/unavailable states, closes on Escape/outside click/navigation. No unread dot is rendered (the feed has no read/unread signal) |

#### Page-module contract (client-side navigation, ADR-005)

Each page module registers one global (`Dashboard`, `Files`, `Uploads`, `Settings`) exposing:

- `init()` — may run **more than once per document**: on first load, and again every time the page
  is navigated back to. It binds to the freshly swapped markup.
- `destroy()` — runs before the router swaps the page out. It removes every listener the module
  added to `window`/`document`, and stops its timers (Dashboard health polling). Listeners bound to
  elements inside `<main>` need no removal; that markup is discarded.
- `beforeLeave()` *(optional)* — returns `Promise<boolean>`; `false` cancels the navigation
  (Settings asks before dropping unsaved edits, since `beforeunload` does not fire).

Uploads are not cancelled by leaving the Upload page: the queue lives in the module and is shown
again on return. Shared chrome (`app.js`, `sidebar.js`, `theme.js`) is evaluated once per document
and must keep using delegated `document` listeners for controls that live in the swapped topbar.
`AFM.refreshChrome()` re-hydrates icons, the active nav entry and keyboard hints after a swap.

### Known gaps: frontend calls without a backend

**This list is empty.** Every call a frontend module makes today resolves against a documented
endpoint in the table above. Do not add an entry for a call that exists — verify against
`fs.routes.js`, `dashboard.routes.js`, `settings.routes.js`, `api.js` (the assembly) and `server.js` first; when a gap is
closed, **delete** its bullet here in the same change that adds the endpoint.

**Removed from this list:**

- `settings.js → GET /settings` — closed: `GET`/`PUT /api/settings` are live (documented above);
  `settings.js` reads and writes the store, and the on-page notice now appears only when the store
  genuinely cannot be reached.
- `app.js → GET /user/profile, GET /storage/quota` — **this entry was itself stale and has been
  deleted.** Neither path has ever existed. `loadGlobalData()` calls **`/api/health`** (the sidebar
  identity/env block, `{success, message, env}`) and **`/api/dashboard/summary`** (the sidebar volume
  card — the only source of capacity), plus one **silent** `/api/settings` read for the workspace
  brand. All three are live; when `/health` or `/dashboard/summary` fails the block renders as
  explicitly *unavailable* rather than a fabricated identity or capacity, and the `/settings` read
  fails silently.

**No Dashboard endpoint is in this list any more.** `GET /dashboard/summary` and
`GET /dashboard/health` are live and documented above; `dashboard.js` and `app.js` are fully
backed. The old `POST /folders` and `POST /shares` calls are gone — folder creation now uses the
**live** `POST /api/fs/folder`, and the share affordance was removed along with the other fabricated
UI rather than left as a dangling call.

`uploads.js` is fully backed: `/fs/upload`, `/fs/list` (destination check), `/fs/tree` (folder
picker), `/fs/folder` (create a missing destination) and `/dashboard/summary` (recent uploads).

`files.js` is fully backed: every call it makes (`/fs/tree`, `/fs/list`, `/fs/folder`,
`/fs/upload`, `/fs/rename`, `/fs/delete`, `/fs/star`, `/fs/download-zip`, `/fs/download`,
`/fs/thumbnail/capability`, and the silent `/settings` default-view read) resolves.

`settings.js` is fully backed: `/settings` (read) and `/settings` (write).

### Upload page: capability claims removed (reversible inventory)

None of these was implemented by the client or the server, so each statement was deleted rather than
left standing. If a capability is built later, its claim can return with it.

| Removed claim | Where it was | Why |
|---|---|---|
| Checksum verification; CDN distribution across "42 edge points-of-presence" | dropzone description | No checksum, no CDN |
| "Auto-encrypted in transit" | dropzone pill | Transport is whatever the deployment provides; nothing here encrypts |
| "Auto-retry on failure" / "automatic retries" | dropzone pill + description | Retry is manual (row or bulk action) |
| "Uploads resume automatically after network interruptions" | queue footer | Transfer is not chunked; an interrupted file restarts from 0 |
| "Uploads resume from the last checkpoint" | tips | Same |
| "save up to 40% space"; "Compress & deduplicate before upload"; `compress`/`dedupe` tags | tips, Optimize Storage preset | Nothing compresses or deduplicates; the `compress` flag was never transmitted |
| "Client-side encryption enabled"; `encrypted`/`verified` tags | Secure Upload preset | Nothing encrypts or verifies |
| "Preserve folder structure" toggle; "the structure is preserved automatically" | options, tips | The server ignores `preservePath`; a folder's files land flat in the destination |
| "Max 5 GB per file" pill and the client-side 5 GB pre-check | dropzone | The limit is `UPLOAD_MAX_BYTES`, configurable and not reported to the client; the server's `413` names the limit in effect |
| "Up to 8 parallel" | dropzone pill | Replaced by the concurrency actually in effect, updated on preset change |
| "Uploaded today" tile | metrics | No source is scoped to a day; now "Completed since this page opened" |
| Seven hardcoded "Recently uploaded" files, "from all admins" | recent strip | Now real `upload` activities from `GET /api/dashboard/summary` (no size: activities carry none); no accounts exist |
| `/releases/2025` destination placeholder | destination strip | The real current destination is rendered from state |

### Settings page: capability claims removed (reversible inventory)

The Settings page used to render six panes of enterprise configuration and asserted server-side facts
that were false. Every entry below was **deleted or replaced with an explicit unavailable note**,
following the quota-panel / API-keys precedent: remove the affordance, or state plainly that the
capability does not exist. Nothing here is implemented by the client or the server, so nothing here
is persisted — the surviving document has exactly three keys (see `GET /api/settings`).

**What survives:** `general.workspaceName` (sidebar brand), `general.defaultUploadFolder` (stored,
not yet consumed), `appearance.defaultView` (Files default layout), and the theme picker, which is
**browser-local** by design (`theme.js`) and says so on the page.

| Removed claim / control | Where it was | Why |
|---|---|---|
| "Two-factor authentication — **Enabled**" badge + its **Manage** button | Security pane → Authentication group | There is **no authentication anywhere** in this application (ADR-003); the badge asserted a state that could not exist, and the button had no handler |
| Single-sign-on **Configure** button ("Okta, Azure AD, Google Workspace") | Security pane → Authentication group | No accounts and no SSO; nothing to configure |
| **Session timeout** select (15 min … Never) | Security pane → Authentication group | No sessions exist to expire |
| "Encryption at rest — **AES-256**" switch (checked **and disabled**) | Security pane → File protection group | Nothing encrypts; `STORAGE_ROOT` holds plaintext. A checked, disabled switch reads as enforced policy |
| "Virus scanning — **ClamAV**" switch (checked) | Security pane → File protection group | No scanner is installed or invoked |
| **Password-protected links** switch | Security pane → File protection group | No share links exist — the share affordance was removed earlier for the same reason |
| **Download watermarking** switch | Security pane → File protection group | Nothing watermarks any document |
| Integration **"Connected" / "Not connected" / "Not configured"** cards (Google Drive, Dropbox, Notion, Slack, Amazon S3, GitHub) | Integrations pane (pane + nav entry removed) | No integration subsystem and **no stored connection state anywhere** — the statuses were fabricated |
| Six integration **Connect / Manage** buttons | Integrations pane | No handler existed for any of them. Replaced by one honest "Not configured" row under the API Keys pane |
| **Webhook endpoint URL** field | API Keys pane → Webhooks group | No event bus and no outbound HTTP request exists in this codebase |
| **Trigger-event tags** (`upload.completed`, `file.deleted`, `share.created`) | API Keys pane → Webhooks group | Same — no event is ever dispatched |
| Five **notification toggles** (upload complete, storage 80% full, failed uploads, new share links, weekly summary email) | Notifications pane (pane + nav entry removed) | No notification subsystem and no mail transport. **The topbar bell is not this pane** — it opens the shared activity panel (`AFM.Notifications`) and is untouched |
| **"Retention & lifecycle"** group + **"Auto-purge temp folder"** switch (checked, "clear `/temp` weekly") | Storage pane | No scheduler, no retention setting and no server-side field for one; nothing cleans `/temp` on a schedule |
| **Interface density** segmented control (Compact / Comfortable / Spacious) | Appearance pane | No CSS variable, class or attribute reads a density preference — verified absent |
| **Reduce motion** switch | Appearance pane | No motion hook exists; nothing reads such a preference |
| **Show file thumbnails** switch | Appearance pane | No per-page thumbnail attribute exists, and preview availability is a fixed server capability (`GET /api/fs/thumbnail/capability`), not an operator preference |
| **Auto-organize by type** switch (checked) | General pane | The upload pipeline has no organiser; files land flat in the destination |
| **Auto-generate thumbnails** switch (checked) | General pane | No thumbnail is generated at upload time; previews are on-demand and no transformer is installed |
| **Deduplication** switch (checked, "detect identical files by hash") | General pane | Nothing hashes or deduplicates |
| **Default language** select (6 locales) | General pane | No i18n layer — every string in the SPA is English |
| **Time zone** select (6 zones, "all timestamps display in this zone") | General pane | No formatter reads a timezone; timestamps render from the browser's own locale |
| **Workspace URL** field (prefilled `dl.dimension.io`) + "shown in shared file links" | General pane | There is no public base URL and no share links; the app is served from the origin it is reached at |
| **"Empty trash"** (`data-danger="empty-trash"`) | Danger Zone pane (removed) | **There is no trash** — deletion is permanent by design (`fs.rm`, no recycle bin) |
| **"Revoke all API keys"** (`data-danger="revoke-keys"`) | Danger Zone pane (removed) | Self-contradictory: the API Keys pane on the same page truthfully states that no keys can be issued |
| **"Transfer workspace ownership"** → the **Transfer** button | Danger Zone pane (removed) | No accounts or ownership primitives; it had not even a `data-danger` attribute, so unlike its neighbours it had **no handler at all** — not even the confirm / "Not performed" path |
| **"Delete workspace"** (`data-danger="delete-workspace"`) | Danger Zone pane (removed) | Would be an **unauthenticated destroy-everything endpoint** on a service with no authentication (ADR-003) |
| "…permanently deleted from the **Linux disk**" | Danger Zone confirm dialog (`settings.js`) | Factually wrong: this application is cross-platform (Windows included). Any future destructive copy names permanence without naming a platform |
| **"Search settings…"** topbar input (`#globalSearch`) + its ⌘K hint | `settings.html` topbar (this page only) | Nothing filtered the page — `globalSearch` appeared exactly once in the codebase, in the ⌘K focus shortcut, so typing in it did nothing. The search box on the other three pages is unaffected |
| "Manage your … preferences, storage, API keys, **integrations**, and appearance" | `<meta name="description">` | Reworded to the settings that actually exist |

**Honest residue kept in place of the removed groups** (the same pattern as the quota panel and the
API keys note): the Storage pane states the quota breakdown is unavailable and points at the
Dashboard; the Security pane states that no authentication or security subsystem exists; the API
Keys pane states that no keys are issued and no third-party service is connected. Nothing renders
"enabled" without a working handler, and no status asserts server state that does not exist. The
Integrations, Notifications and Danger Zone panes were removed **together with their nav entries**
rather than stubbed; `?pane=<removed>` silently falls through to General, which is what the markup
opens on.

A live-server scan in `test/integration/live-server.test.js` refuses a list of these strings on
`/settings.html` (`ClamAV`, `AES-256`, `Two-factor`, `Google Drive`, `Dropbox`, `Slack`,
`webhook`, `Empty trash`, `Revoke all`, `Transfer`, `Delete workspace`, `Linux disk`, `Auto-purge`,
`Deduplication`, `Auto-organize`), scoped to that one page because "Transfer" is honest copy
elsewhere.

### File-type taxonomy (shared contract)

Classification is by lowercase file extension. **`src/utils/fileTypes.js` is the single
server-side source of truth** — `CATEGORIES`, `EXTENSION_MAP`, `classifyFile(name)`,
`emptyBreakdown()` — and both `FileSystemService.getTreeStats` (the Dashboard donut) and
`fs.controller.js` `getList` (the listing's `type`, filter and `counts`) classify through it.

The server set was reconciled **upward** to the client's `FileTypes` table in `app.js` (the
superset), so every extension the UI badges is reachable by its chip:

| Category | Extensions |
|---|---|
| `image` | jpg jpeg png gif webp svg bmp ico avif heic |
| `video` | mp4 mkv mov avi webm flv wmv m4v |
| `audio` | mp3 wav flac aac ogg m4a wma |
| `document` | pdf doc docx txt rtf odt xls xlsx ppt pptx csv md |
| `archive` | zip rar 7z tar gz bz2 xz iso dmg |
| `code` | js ts jsx tsx html css scss json xml php py java go rs sh yml yaml sql |
| `other` | everything else, including extension-free and dot-prefixed names |

**Guarded by `test/utils/fileTypes.test.js`**, which asserts the server and client extension sets
are equal and that `fs.controller.js` carries no inline extension literal. Editing one side without
the other fails the suite.

Two breakdowns, two contracts — never cross-asserted:
- the **listing** `counts` include `folder` (the chip row presents folders as a browsable type) and
  `other`;
- the **storage** breakdown (`emptyBreakdown()`, Dashboard donut) has no `folder` key — a folder has
  no bytes to attribute.

Effect of the reconciliation on the Dashboard: files previously counted as `other` (e.g. `.ts`,
`.md`, `.bmp`) now fall into their real category, so the donut's slices shift. Recorded in ADR-003.

## Deployment contract (ADR-008)

Additive section (production-cicd-readiness). The operator runbook is `docs/DEPLOYMENT.md`.

- **Configuration contract.** Required: `STORAGE_ROOT`, an absolute, existing, readable and
  traversable directory, never created by the service. `AFM_DATA_DIR` is also required when
  `NODE_ENV=production`; elsewhere it defaults to `<cwd>/data`. Optional: `PORT` (`3000`),
  `NODE_ENV` (`development`), and `UPLOAD_MAX_BYTES` (a positive integer, default 5 GiB). All are
  validated by `config.validateStartup()` in `server.js` **before** `listen`. An unusable value exits
  with `FATAL CONFIGURATION ERROR: <variable> …` and is never a per-request failure. Values are read
  once at startup, and the process environment wins over `.env` (`dotenv` never overrides a set
  variable). The template is `.env.example`.
- **Persistence guarantees.** `metadata.json` and `settings.json` resolve under `AFM_DATA_DIR`
  (`src/config/dataDir.js`), not the release's working directory. Activation, rollback and pruning
  cannot change them or `STORAGE_ROOT`. A first-run store creation is logged as
  `[store] First run: initialised an empty … store at …`. A corrupt store still fails wholly with a
  `500` (unchanged).
- **Activation gate.** A release becomes live only after `npm test` passes **in the release**. It is
  live only while `GET /api/v1/health` answers `"success":true` and `"apiVersion":1` within 60 s of a
  restart. `apiVersion` is therefore load-bearing for deployment: changing it without updating
  `EXPECT_API_VERSION` in `deploy.sh` causes every deploy to roll back.
- **Release and rollback model.** Releases are immutable `releases/<UTC-stamp>-<sha12>` directories
  behind an atomically renamed `current` symlink, with a `previous` symlink for single-command
  rollback and a retention cap of 5 (active and previous always kept). Each deploy reports
  `DEPLOY_OUTCOME` as `success`, `pre-activation-failed`, `rolled-back`, `rollback-failed` or
  `superseded`.
- **Shutdown.** `SIGTERM`/`SIGINT` stops new connections, drains in-flight requests, and force-exits
  after 30 s. This is ordered below systemd's 45 s and nginx's 600 s.
- **Exposure is reduced, not closed.** `api-security-hardening` made CORS same-origin by default,
  enabled a CSP, rate-limited mutating routes, closed the symlink escape and removed `env` from the
  health endpoint. **The API is still unauthenticated** and the app still binds every interface, so
  the host firewall remains a required compensating control (ADR-003, ADR-008). Cross-origin and
  cross-site request forgery are only meaningfully closed once authentication lands.
