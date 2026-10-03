# Proposal

## Why

The Dashboard renders no real server state and simultaneously displays ~19 fabricated values. Its six data-driven panels are empty because every renderer early-returns on empty state (`public/assets/js/dashboard.js:108,161,203,221,347`), while what the user *does* see is hardcoded markup (`public/index.html:65` `24.8K`, `:96` `217`, `:132-135` `Sarah Chen`, `:234` `12.4 GB`, `:433,435` unconditional `All systems operational` / `Healthy`) plus two JavaScript fallbacks that **always execute** because their endpoints 404 (`public/assets/js/app.js:880` `Linux Admin`, `:887` `342 GB of 500 GB`).

Both dashboard endpoints called by `dashboard.js:54,79` do not exist. Every page load produces a 404, an error toast from `public/assets/js/api.js:73-78`, blank panels, and a 5-second poll (`dashboard.js:462`) that 404s indefinitely — started even after failure, because the `catch` at `dashboard.js:67-71` never rethrows.

This change must be completed **before** recursive filesystem aggregation is introduced, because `src/services/PathService.js:31` uses `targetPath.startsWith(rootPath)` with no separator boundary. Verified: `/../download-secret/x` resolves to `D:\download-secret\x` and is **ALLOWED**, and that path flows unmodified through `validateClientPath` (`src/utils/validators.js:61-72`, which permits `..`) into `fs.rm(..., {recursive:true, force:true})` at `src/services/FileSystemService.js:164`. A Dashboard walk would traverse that space on every request.

## What Changes

- **BREAKING (security):** Fix path containment in `src/services/PathService.js` — `resolveSecurePath` AND `toClientPath` — from naive string-prefix matching to `target === root || target.startsWith(root + path.sep)`.
- Add `GET /api/dashboard/summary` and `GET /api/dashboard/health` returning **bare** JSON (no `{success,data}` envelope). This follows the existing convention in `fs.controller.js`, where both read handlers return bare shapes (`GET /fs/tree` `:57` bare array, `GET /fs/list` `:151-155` bare object) and all four mutating handlers use the envelope — a 1:1 correspondence. `api.js:71` returns the parsed body verbatim with no `.data` unwrap; `dashboard.js:57-62` reads top-level keys and `:79-80` hard-gates on `Array.isArray`. Both endpoints are new, so nothing breaks.
- Add `src/routes/dashboard.routes.js` mounted at `/api/dashboard` in `server.js`, positioned **before** the `/api` catch-all at `server.js:35-37` (a two-argument middleware that never calls `next()`, so it terminates the chain).
- Add `src/controllers/dashboard.controller.js` composing existing services at controller level, matching the existing idiom at `src/controllers/fs.controller.js:90-91`. **No `DashboardService`.**
- Add bounded, link-skipping recursive aggregation to `FileSystemService` (files-only bytes; `Dirent.isSymbolicLink()` entries skipped entirely).
- Add volume-capacity reads to `FileSystemService` via `fs.promises.statfs`, with `bavail` pinned as the contract choice.
- Add Top-N download aggregation to `MetadataService`; expose the already-implemented but never-routed `MetadataService.getActivities()` (`src/services/MetadataService.js:122-125`).
- **Fix a pre-existing defect (prerequisite, separate change):** `MetadataService` creates `data/` lazily. `data/` is absent and `git ls-files data` is empty, so `GET /api/fs/list` is already failing on a fresh checkout (`_read` `MetadataService.js:26-31` calls `_write` inside its own `catch`, so the second `ENOENT` escapes as a raw error, not an `AppError`).
- Remove every fabricated Dashboard value across **all four** HTML pages (the sidebar is duplicated 4× with no shared-layout mechanism; `settings.html:1021,1194,1196` additionally embed the fake `217` inside JavaScript).
- Remove historical affordances that cannot be honestly produced: the 30d/7d/24h tablist (`index.html:323-327`, no handler), the "last 30 days" (`:321`) and "last 14 days" (`:341`) copy, the traffic chart (`dashboard.js:159-199`), sparklines (`:117-119`), trend percentages (`:127`), and `Live` badges (`:70,358`).
- Introduce `node:test` and a mandatory security regression suite.
- Add `docs/decisions/ADR-002` and synchronise `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `docs/backend-checklist.md`, `docs/checklist..md`, `docs/architecture.md:765`.

### Preserved, not changed

`GET /api/health` (`server.js:28-30`) remains the liveness/environment endpoint. It is **not** converted into the Dashboard health widget — it returns `{success,message,env}` with no metric fields, is documented live at `docs/CONTRACTS.md:21`, and has **zero** frontend callers.

## Capabilities

### New Capabilities

- `dashboard-api`: The two dashboard endpoints — bare response shapes, field types, units, nullability, partial-capability failure semantics, and mount ordering.
- `filesystem-aggregation`: Bounded recursive tree aggregation — file/folder counts, file-only byte totals, dotfile exclusion, inaccessible-subtree degradation, and the entry/time budgets.
- `storage-semantics`: The three distinct storage quantities (`treeBytes`, `usedBytes`, `totalBytes`), the pinned `bavail` formula, `volumeAvailable`, and null-when-unavailable behaviour.
- `dashboard-health`: Dashboard-scoped runtime metrics as a bare metric array, distinct from `/api/health`.
- `dashboard-metadata`: Activity retrieval and Top-N download aggregation over the existing `MetadataService` store.
- `dashboard-frontend`: Loading / success / empty / unavailable / partial / error / polling states; removal of all fabricated fallbacks; reuse of existing `.skeleton` / `.empty-state` primitives.
- `dashboard-historical-metrics`: Explicit absence of retained history and the required removal of every misleading historical affordance.
- `filesystem-security`: Path-containment boundary, `toClientPath` consistency, the link/junction skip policy, and the prohibition on leaking absolute OS paths.
- `cross-platform-contract`: Windows and Linux invariants for root resolution, containment, separators, link handling, byte accounting, and `statfs` — with no OS-specific detail permitted in the HTTP contract.

### Modified Capabilities

None. `openspec list --specs` reports `No specs found`, so this repository has no existing capability inventory and every capability above is introduced new.

## Impact

**New files**
- `src/routes/dashboard.routes.js`
- `src/controllers/dashboard.controller.js`
- `data/.gitkeep` (restores the seed `.gitignore:16` already anticipates)
- `test/**` (`node:test` suites)
- `docs/decisions/ADR-002`

**Modified files**
- `src/services/PathService.js` (containment, both directions)
- `src/services/FileSystemService.js` (aggregation + capacity)
- `src/services/MetadataService.js` (bootstrap + Top-N)
- `server.js` (one mount line, before the catch-all)
- `package.json` (`test` script only — **zero new dependencies**)
- `public/assets/js/dashboard.js`, `public/assets/js/app.js`
- `public/index.html`, `public/files.html`, `public/uploads.html`, `public/settings.html`
- `AGENTS.md`, `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `docs/architecture.md`, `docs/backend-checklist.md`, `docs/checklist..md`

**Untouched:** `src/routes/fs.routes.js`, `src/controllers/fs.controller.js` (its `_extKey` taxonomy at `:93-104` is **reused**, not moved), `src/middlewares/errorHandler.js`, `src/config/env.js`, `src/utils/validators.js`, `public/assets/js/api.js`.

**Merge-conflict hotspots** (Graphify aggregate degree): `app.js` 124 · `fs.controller.js` 84 (untouched) · `package.json` 74 · `MetadataService.js` 62 · `FileSystemService.js` 50 · `server.js` 30 · `PathService.js` 26.

**Cross-platform:** Windows and Linux, field-for-field identical HTTP contract. Verified runtime: Node v24.15.0, win32 x64.

**Non-goals** are enumerated in `design.md`.
