# Tasks

Cross-repo change. Portal tasks live in the sibling change
`C:\PRO\files-server-web\openspec\changes\decouple-storage-and-release-paths\tasks.md`.
**Ship order: portal (§P) → admin (§1–§5) → operator steps (§6).**

## 1. Schema and volume identity

- [ ] 1.1 Migration 5 in `src/db/schema.js`: `integration_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`; SQL only in a new `src/db/repositories/IntegrationSettingsRepository.js`
- [ ] 1.2 `IntegrationSettingsService` (static singleton): get/set validated keys `volume_id`, `release_client_path`, `portal.auth_session_minutes`, `portal.max_failed_attempts`, `portal.lockout_minutes`
- [ ] 1.3 Volume stamp at startup per design D1 table (create marker with `wx`, never overwrite; report `missing` / `mismatch` / `unwritable`)
- [ ] 1.4 Test: each D1 row, using a temp `STORAGE_ROOT` and temp DB (never the real stores)
- [ ] 1.5 Test: `/.dimension-volume` is absent from list, tree, search and dashboard walks, and refused by rename/delete/upload/folder

## 2. Settings API

- [ ] 2.1 `GET /api/v1/admin/portal/settings` (bare `{ volume: {id, status}, releaseClientPath, auth }`) and `PUT` (enveloped, strict full replace, `400` on unknown keys)
- [ ] 2.2 `releaseClientPath` validated with `validateClientPath`, resolved via `PathService.resolveSecurePath`, must be an existing folder
- [ ] 2.3 Contract tests for 2.1–2.2, including the `/api` alias

## 3. Retire `.env` editing and `PORTAL_ROOT`

- [ ] 3.1 `GET /admin/portal/config` always returns `{ available: false, reason, values: null }`; `PUT` → `503`. Delete the `.env` reader/writer in `PortalService`
- [ ] 3.2 Portal log read from `PORTAL_LOG_FILE` (absolute); unset/relative → `available: false`
- [ ] 3.3 Startup log line when `PORTAL_ROOT` is set: ignored
- [ ] 3.4 Update existing system/admin contract tests that assumed `PORTAL_ROOT`

## 4. Admin UI

- [ ] 4.1 Admin → File portal: volume status line, release folder field, three tunables; remove `FILES_ROOT` / `RELEASE_PVM` / `AUTH_ENABLED` fields
- [ ] 4.2 All values through `window.API` (new builders in `api.js`), escaped at render; `missing`/`mismatch` explain the recovery step
- [ ] 4.3 Frontend test: removed fields stay removed; status strings escaped

## 5. Docs

- [ ] 5.1 `docs/decisions/ADR-010-cross-app-path-contract.md` (logical-only sharing, marker identity, deferred multi-volume)
- [ ] 5.2 `docs/CONTRACTS.md`: new endpoints, retired config behaviour, marker file
- [ ] 5.3 `docs/DATABASE.md`: migration 5, `integration_settings` keys
- [ ] 5.4 `docs/DEPLOYMENT.md` + `.env.example`: `PORTAL_LOG_FILE`, remove `PORTAL_ROOT`, marker recovery step, bind-mount note for a separate release disk
- [ ] 5.5 `AGENTS.md` + `docs/REPO_MAP.md`: new service, retired `PORTAL_ROOT`
- [ ] 5.6 `npm test` passes; `graphify update .`

## 6. Operator rollout

- [ ] 6.1 Deploy the portal release from §P (accepts v4 and v5)
- [ ] 6.2 Deploy the admin; confirm `volume.status: "ok"` in Admin → File portal
- [ ] 6.3 Set the release folder and lock it, then confirm anonymous `/api/releases` → `401` on the portal
- [ ] 6.4 Remove `PORTAL_ROOT` (admin) and `RELEASE_PVM` (portal) from host config; set `PORTAL_LOG_FILE`
