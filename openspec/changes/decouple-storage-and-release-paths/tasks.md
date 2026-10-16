# Tasks

Cross-repo change. Portal tasks live in the sibling change
`C:\PRO\files-server-web\openspec\changes\decouple-storage-and-release-paths\tasks.md`.
**Ship order: portal (§P) → admin (§1–§5) → operator steps (§6).**

## 1. Schema and volume identity

- [x] 1.1 Migration 5 in `src/db/schema.js`: `integration_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`; SQL only in a new `src/db/repositories/IntegrationSettingsRepository.js`
- [x] 1.2 `IntegrationSettingsService` (static singleton): get/set validated keys `volume_id`, `release_client_path`, `portal.auth_session_minutes`, `portal.max_failed_attempts`, `portal.lockout_minutes`
- [x] 1.3 Volume stamp at startup per design D1 table (create marker with `wx`, never overwrite; report `missing` / `mismatch` / `unwritable`)
- [x] 1.4 Test: each D1 row, using a temp `STORAGE_ROOT` and temp DB (never the real stores)
- [x] 1.5 Test: `/.dimension-volume` is absent from list, tree, search and dashboard walks, and refused by download/rename/delete/move/copy/folder (guard added in `PathService.resolveSecurePath`: rename/delete/move/copy took whole paths and could reach it)

## 2. Settings API

- [x] 2.1 `GET /api/v1/admin/portal/settings` (bare `{ volume: {id, status}, releaseClientPath, auth }`) and `PUT` (enveloped, strict full replace, `400` on unknown keys)
- [x] 2.2 `releaseClientPath` validated with `validateClientPath`, resolved via `PathService.resolveSecurePath`, must be an existing folder
- [x] 2.3 Contract tests for 2.1–2.2, including the `/api` alias

## 3. Retire `.env` editing and `PORTAL_ROOT`

- [x] 3.1 `GET /admin/portal/config` always returns `{ available: false, reason, values: null }`; `PUT` → `503`. Delete the `.env` reader/writer in `PortalService`
- [x] 3.2 Portal log read from `PORTAL_LOG_FILE` (absolute); unset/relative → `available: false`
- [x] 3.3 Startup log line when `PORTAL_ROOT` is set: ignored
- [x] 3.4 Update existing system/admin contract tests that assumed `PORTAL_ROOT`

## 4. Admin UI

- [x] 4.1 Admin → File portal: volume status line, release folder field, three tunables; remove `FILES_ROOT` / `RELEASE_PVM` / `AUTH_ENABLED` fields
- [x] 4.2 All values through `window.API` (plain `API.get`/`API.put`, as every admin call; builders are only for non-fetch transports, so none was needed), escaped at render (`textContent`); `missing`/`mismatch` explain the recovery step
- [x] 4.3 Frontend test: removed fields stay removed; status strings escaped

## 5. Docs

- [x] 5.1 `docs/decisions/ADR-010-cross-app-path-contract.md` (logical-only sharing, marker identity, deferred multi-volume)
- [x] 5.2 `docs/CONTRACTS.md`: new endpoints, retired config behaviour, marker file
- [x] 5.3 `docs/DATABASE.md`: migration 5, `integration_settings` keys
- [x] 5.4 `docs/DEPLOYMENT.md` + `.env.example`: `PORTAL_LOG_FILE`, remove `PORTAL_ROOT`, marker recovery step, bind-mount note for a separate release disk
- [x] 5.5 `AGENTS.md` + `docs/REPO_MAP.md`: new service, retired `PORTAL_ROOT`
- [x] 5.6 `npm test` passes (1083/1084; the one failure, `security-docs` "nginx template no longer claims CORS is open", fails identically on the untouched base commit); `graphify update .`

## 7. Portal located anywhere in the storage (design D2, second revision)

- [x] 7.1 Root marker carries `clientPath "/"`; optional published portal folder (`portal_root_client_path`) with its own marker
- [x] 7.2 `PUT /admin/portal/settings` takes `portalRootClientPath` (optional): `409` unless volume ok or on a foreign marker; write new marker, store, remove old. Release folder NOT checked against it. Response is the full settings document
- [x] 7.3 `GET` reports `portalRoot: { clientPath, status }`; a missing folder marker is restored at startup and on read once the volume is ok
- [x] 7.4 Rename/move hook rewrites the stored folder and release paths (and the marker's `clientPath`)
- [x] 7.5 `PathService` reserved-name guard on every segment
- [x] 7.6 No `reachable` in Check access: the admin cannot know where a portal runs (added, then removed in the same change)
- [x] 7.7 Admin UI "Portal folder (optional)" + status; contract and frontend tests; CONTRACTS/DEPLOYMENT/ADR-010 updated

## 6. Operator rollout

- [ ] 6.1 Deploy the portal release from §P (accepts v4 and v5)
- [ ] 6.2 Deploy the admin; confirm `volume.status: "ok"` in Admin → File portal
- [ ] 6.3 Set the release folder and lock it, then confirm anonymous `/api/releases` → `401` on the portal
- [ ] 6.4 Remove `PORTAL_ROOT` (admin) and `RELEASE_PVM` (portal) from host config; set `PORTAL_LOG_FILE`
