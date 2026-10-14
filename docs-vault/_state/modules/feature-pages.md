---
module: Feature Pages
slug: feature-pages
purpose: Dashboard, Uploads, Settings, Admin and Login page shells, page modules and page stylesheets of the SPA.
roots:
  - public/
language: javascript
complexity: high
loc: 8634
files:
  - public/index.html
  - public/uploads.html
  - public/settings.html
  - public/admin.html
  - public/login.html
  - public/assets/js/dashboard.js
  - public/assets/js/uploads.js
  - public/assets/js/settings.js
  - public/assets/js/admin.js
  - public/assets/js/login.js
  - public/assets/css/dashboard.css
  - public/assets/css/uploads.css
  - public/assets/css/settings.css
  - public/assets/css/admin.css
  - public/assets/css/login.css
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
Five static HTML shells plus one IIFE page module and one page stylesheet each. Every shell loads `theme.js` synchronously in `<head>`, declares `<meta name="afm-api-base" content="/api/v1">`, links the shared CSS stack (`tokens`, `base`, `themes`, `layout`, `components`) followed by its page CSS, and sets `<body data-page="...">` (`dashboard`, `uploads`, `settings`, `admin`, `login`). Deferred scripts load in a fixed order: `api.js` → `app.js` → `sidebar.js` → `router.js` → (`notifications.js` on uploads/settings/admin) → page module. `admin.html` reuses `settings.css` for its pane layout and adds `admin.css`.

Control enters through a `DOMContentLoaded` listener in each module that calls `init()` only when `document.body.dataset.page` matches. When `router.js` swaps pages in place it calls the module's `init()` again and `destroy()` on the way out (Settings also exposes `beforeLeave()` for an unsaved-edits confirm). Each module is a closure-scoped state object, a set of render functions writing into fixed DOM ids, and event handlers that call `window.API`.

`login.html` is standalone: no sidebar, no `router.js`, no `layout.css`; `login.js` is a bare IIFE that only binds the form submit.

Per-page flow:
- **Dashboard** (`dashboard.js`): `init()` → `renderAll()` skeletons → `loadSummary()` (`GET /dashboard/summary`) → on success `startHealthPolling()` (5 s `setInterval` of `GET /dashboard/health`, skipped when the tab is hidden, stopped permanently after the first failure). Renders stats, volume line, storage donut, activity, top files, capabilities, health, quick actions. Quick-action "newFolder" posts `/fs/folder` at the root.
- **Uploads** (`uploads.js`): client-side queue engine. `addFiles` → destination verdict (`verifyDestination` probes `GET /fs/list?path=…&limit=1`, cached per path with in-flight promise dedupe) → `fillActive()` starts up to `state.concurrency` transfers via `processUpload` (`API.upload('/fs/upload', FormData)` with `destination` and `overwrite` appended before `file`). Items move through `queued/held/uploading/paused/done/failed`; a 1 s ticker recomputes metrics. Recent uploads come from `GET /dashboard/summary` activities; the folder picker from `GET /fs/tree`.
- **Settings** (`settings.js`): `TEXT_FIELDS`/`SEGMENTED_FIELDS` tables drive hydrate (`GET /settings`) and extract (`PUT /settings` full document). Dirty tracking shows a save bar; tri-state `serverBacked` blocks saves before/without a store answer.
- **Admin** (`admin.js`): pane switcher (same pattern as Settings), users table and policies table rendered from `GET /admin/users` and `GET /admin/files/policies`, a permissions side panel per policy path, delegated table actions. A 403 on users shows an "not an administrator" notice.
- **Login** (`login.js`): `POST /auth/login` with `skipAuthRedirect`, stores CSRF via `API.setCsrfToken`, then navigates to a sanitized `?redirect=` target.

<!-- c2d:s2 -->
### Public API
```js
window.Dashboard = { init(): Promise<void>, destroy(): void,
  resolvePanelState, resolveHealthPanelState, resolveVolumeLine(storage, resolver?),
  formatGb, toProportion, formatMetric, formatTimestamp, formatStatValue, splitClientPath }
```
Dashboard lifecycle plus pure formatting/state helpers exported for tests.

```js
window.Uploads = { init(), destroy(), presets, DEFAULT_PRESET, DEFAULT_OPTIONS, FAILURE_LABELS,
  pure: { computeProgressPct, computeRemainingSeconds, formatRemaining, scaleTransferred,
          computeQueueCounts, computeQueueTiles, computeGlobalProgress, failureKind, describeFailure,
          normalizeDestination, describeVerdict, flattenTree, selectRecentUploads, buildAnnouncement,
          createDragState, presetTags, renderItemHTML, uploadingMeta },
  _controller: { getState, addFiles, fillActive, startUploads, ... } }
```
Upload page lifecycle; `pure` and `_controller` are test seams. `destroy()` keeps the queue and in-flight transfers alive; it only removes window drag/drop listeners.

```js
window.Settings = { init(), destroy(), beforeLeave(): Promise<boolean> }
```
Settings form lifecycle; `beforeLeave` is consulted by the router before a client-side navigation.

```js
window.Admin = { init(), destroy(), _internal: { renderUsersTable, renderPoliciesTable } }
```
Admin page lifecycle; `_internal` is a test seam.

`login.js` exports nothing (closed IIFE).

DOM contract consumed by `router.js`: `body[data-page]` values `dashboard`, `uploads`, `settings`, `admin`, `login`.

HTTP endpoints called (relative to `API.BASE_URL`):
```
GET  /dashboard/summary          (dashboard, uploads recent list)
GET  /dashboard/health           (dashboard poll)
POST /fs/folder                  (dashboard quick action, uploads create-destination)
GET  /fs/list?path=&limit=1      (uploads destination probe)
GET  /fs/tree                    (uploads folder picker)
POST /fs/upload  (API.upload)    (uploads)
GET  /settings, PUT /settings    (settings)
GET/POST /admin/users; POST /admin/users/:id/status|reset-password|revoke-sessions; DELETE /admin/users/:id
GET /admin/files/policies; PUT/DELETE /admin/files/policy; GET/POST/DELETE /admin/files/permissions
POST /auth/login                 (login)
```

<!-- c2d:s3 -->
### Internal Patterns
- **Revealing-module IIFEs** (`const X = (() => { ...; return {...}; })(); window.X = X;`) destructuring helpers from `window.AFM` at load time.
- **Re-entrant lifecycle**: `init()` resets state; document/window listeners are tracked (`listen()` + `globalListeners` in settings/admin, a stored `onQuickClick` in dashboard, named drag handlers in uploads) and removed in `destroy()`.
- **Silent API calls**: `{ silent: true }` is passed where the page reports the failure itself (inline notice) so `api.js` does not also toast.
- **Unavailable is not zero**: Dashboard uses `UNAVAILABLE_MARK = '—'` and `AFM.resolveStorageDisplay`; Uploads uses `Format.duration(null)` as its `UNAVAILABLE` marker.
- **Allow-list mapping before markup**: activity types reduced to `ACTIVITY_TYPE_CLASSES`, icons via `ICON_ALIASES`/`resolveIconName`, `safeColor`; all dynamic text through `escapeHtml`.
- **Bounded polling**: health poll halts on first failure; refresh or the "health" quick action restarts it.
- **Uploads concurrency control**: `state.activeCount` vs `state.concurrency`; per-item `attempt` counter discards progress/completion callbacks from superseded attempts; per-destination verdict cache with in-flight promise reuse; failure kind from `err.status`/server `kind`, never message text; batched outcome toasts via a 1.2 s timer; aria-live announcements.
- **Table-driven forms** (Settings): one field table drives hydration, extraction and dirty-detection, so the PUT payload is always the complete document.
- **Open-redirect guard** (Login): `safeRedirectTarget()` accepts only root-relative paths, rejecting `//` and `://`.
- **Deviation**: `settings.js` header comment says `general.defaultUploadFolder` feeds the Uploads destination, but `uploads.js` contains no reference to settings or that key.
- **Deviation**: `index.html` does not load `notifications.js`, unlike the other three routed pages.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - **Frontend Core** — `window.AFM` (`$`, `$$`, `icon`, `Icons`, `Format`, `Toast`, `Modal`, `escapeHtml`, `resolveType`, `uid`, `clamp`, `resolveStorageDisplay`, `applyWorkspaceName`, `Notifications.bindTopbarBell`), `window.API` (`get`, `post`, `put`, `del`, `upload`, `setCsrfToken`), `router.js` lifecycle (`init`/`destroy`/`beforeLeave`), `sidebar.js`, `theme.js`, shared CSS (`tokens`, `base`, `themes`, `layout`, `components`).
   - **HTTP API Layer** — dashboard, fs, settings, and admin REST endpoints listed in Public API.
   - **Auth and Access Control** — `POST /auth/login`, CSRF token handoff, 401 redirect behaviour (`skipAuthRedirect`), 403 handling on `/admin/*`.
2. **Third-party packages** — none; plain browser JS/CSS, no bundler.

<!-- c2d:s5 -->
### Complexity
High. The module is ~8.6k lines, with `uploads.js` (1546 lines, ~260 branching constructs) and `dashboard.js` (1116 lines, ~148) carrying most logic. `uploads.js` is the most complex file: it is a client-side scheduler with concurrent XHR transfers, pause/resume/cancel/retry per item and in bulk, attempt-versioning to drop stale callbacks, an asynchronous destination-verdict cache that holds and releases queued items, re-verification after destination-type failures, a timer-driven metrics ticker, drag-and-drop directory walking, and incremental DOM patching — all mutating one shared `state` object from many async continuations. `processUpload`/`fillActive` are the core hot path.

<!-- c2d:s6 -->
### Key Files
- `public/assets/js/uploads.js` — upload queue engine, destination validation/picker, presets and progress metrics.
- `public/assets/js/dashboard.js` — dashboard summary rendering, health polling and quick actions.
- `public/assets/js/settings.js` — table-driven settings form with hydrate/extract, dirty tracking and save/discard.
- `public/assets/js/admin.js` — user management, file policies and per-path permissions UI.
- `public/assets/js/login.js` — sign-in form with CSRF handoff and open-redirect guard.
- `public/index.html` — dashboard shell; representative of script/CSS load order and `data-page` gating.

<!-- c2d:s7 -->
### Limitations & Improvements

**1. Bug or Risk — Login open-redirect guard bypassable with a backslash or stripped control character** (`public/assets/js/login.js`, lines 18-24, severity: medium)
`safeRedirectTarget()` rejects only values that do not start with `/`, that start with `//`, or that contain `://`. Browsers parse a backslash as a slash for http(s) URLs and strip tab/newline characters, so `?redirect=/\evil.example` or `?redirect=/%09/evil.example` passes every check and `window.location.href = '/\evil.example'` resolves to `https://evil.example/`. A crafted login link therefore still sends a freshly authenticated admin off-site. Fix: resolve the value against the current origin and require the origin to match.
```js
// before
if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return 'index.html';
return raw;
// after
let url;
try { url = new URL(raw, window.location.origin); } catch { return 'index.html'; }
if (!raw.startsWith('/') || url.origin !== window.location.origin) return 'index.html';
return url.pathname + url.search + url.hash;
```

**2. Bug or Risk — Dashboard health poll can start after the page has been destroyed** (`public/assets/js/dashboard.js`, lines 1073-1093, severity: medium)
`init()` returns `loadSummary().then(ok => { if (ok) startHealthPolling(); })`. If the router navigates away before the summary resolves, `destroy()` runs first (its `stopHealthPolling()` is a no-op because no timer exists yet), and then the late `.then` starts a 5 s interval on a page that is gone. `renderHealth()` returns early when `#serverHealth` is absent, so `readHealth()` reports `true` and the self-terminating guard never trips: `GET /dashboard/health` keeps firing every 5 s on Files/Uploads/Settings until a full reload. Fix: track liveness and skip the start after destroy.
```js
let alive = false;
function init() { alive = true; ...; return loadSummary().then(ok => { if (ok && alive) startHealthPolling(); }); }
function destroy() { alive = false; stopHealthPolling(); ... }
```
The same guard belongs in `startHealthPolling()` itself so the refresh and quick-action paths are covered too.

**3. Bug or Risk — `verifyDestination({ force: true })` returns a stale in-flight check** (`public/assets/js/uploads.js`, lines 598-609, severity: low)
When a check for the path is already `checking`, the in-flight promise is returned even with `force: true`. A forced re-check is meant to observe state after a change (`createFolder` at line 634 calls it right after `POST /fs/folder`; `recheckAfterFailure` at line 756 after a failed upload); if a probe started before that change is still pending, its pre-change verdict (e.g. `missing`) is returned and cached, so a just-created folder can be reported as unusable. Fix: when `force` is set and a check is in flight, chain a fresh check after it (`return known.promise.then(() => verifyDestination(path, { force: true }))`) or keep a generation counter so only the newest check writes the cache.

**4. Improvement Opportunity — Settings header claims a consumer that does not exist** (`public/assets/js/settings.js`, lines 5-10, severity: low)
The module header says `general.defaultUploadFolder → the Uploads page destination`, but `uploads.js` never reads settings or that key (the project rules state it is stored but not yet read by any page). The comment misleads anyone tracing the setting. Fix: reword to "validated and stored; not yet read by any page", or wire `uploads.js` `initDestination()` to seed `state.destination` from `GET /settings`.

No other notable issues found: dynamic markup in `admin.js`/`dashboard.js` is escaped (toasts escape inside `app.js`), Settings guards unsaved edits via both `beforeunload` and `beforeLeave()`, and the upload engine's attempt-versioning and never-rejecting `checkDestination` keep its shared `state` consistent.
