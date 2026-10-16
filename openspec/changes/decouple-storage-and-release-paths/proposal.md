# Proposal

## Why

The Admin Files Manager and the File Portal (`files-server-web`) only behave correctly when their
directories line up. That alignment is assumed and never checked:

- **A policy is a path string relative to a root.** The admin stores `client_path` relative to
  `STORAGE_ROOT`. The portal builds `"/" + rel` relative to *its own* `FILES_ROOT`
  (`lib/admin-db.js` `clientPathOf`). The two only agree when both variables name the same
  directory. Nothing checks this. A comment in the portal's `.env.example` is the whole contract.
- **A mismatch fails open.** A path with no matching policy is *ungoverned*, and the portal allows
  it at `download`. If `FILES_ROOT` is a parent, a subfolder, another mount of the same share, or a
  different spelling (UNC vs drive letter, container vs host path), every governed file silently
  becomes public. Nothing logs an error.
- **The release folder must sit inside the files root.** `RELEASE_PVM` is an absolute OS path.
  `releaseRel()` returns `null` when it is outside `FILES_ROOT`, and release protection then
  switches off (`releaseRootDecision` → `allow`). The admin can only lock the matching client path
  if it guesses the same root.
- **The admin writes another project's `.env`.** `PortalService` edits `<PORTAL_ROOT>/.env`. That
  assumes the portal is a mutable project folder, which contradicts immutable releases (ADR-008). It
  lets the admin set `FILES_ROOT` to anything, which breaks the first point. Changes only apply
  after a portal restart.
- **The admin reads the portal log at a guessed path.** It reads `<PORTAL_ROOT>/data/portal.log`
  hard-coded and ignores the portal's own `LOG_FILE`.
- **Portal state follows the code directory.** Relative `FILES_ROOT`, `RELEASE_PVM`,
  `ADMIN_DB_PATH`, `LOG_FILE` and `AUTH_USERS_FILE` resolve against the portal's `__dirname`. The
  admin fixed the same bug with `AFM_DATA_DIR`.

The goal: storage, release folder, admin release and portal release can each live anywhere, and the
integration either works or refuses loudly.

## What Changes

The two apps share **logical identifiers only**, through `admin.sqlite`. Each app maps them to
physical paths in its own host configuration.

- **Storage volume identity (new).** The admin gives its storage a UUID. It stores the UUID in
  `admin.sqlite` and writes it into a marker file `.dimension-volume` at `STORAGE_ROOT`. In
  integration mode the portal reads that marker from its `FILES_ROOT`. If the marker is missing or
  differs from the database, the portal **refuses integration mode**. This replaces string
  equality between paths with a content check that holds on any mount point or host.
- **The portal may serve any folder of the storage, with nothing to match (new).** Example: the
  admin `STORAGE_ROOT` is `C:\Users\eleven` and the portal `FILES_ROOT` is
  `C:\Users\eleven\Downloads`. The portal climbs from `FILES_ROOT` to the storage-root marker,
  works out that it is the admin folder `/Downloads`, and maps its paths to `"/Downloads/" + rel`.
  Policies on that folder and every ancestor apply. No admin setting is needed. For a portal host
  that cannot see the storage root (a container mounting one folder), the admin can publish a
  marker into that folder (optional "Portal folder"). A copied, stale marker is not trusted
  (design D2).
- **Release folder becomes a client path (new).** The release folder is stored in `admin.sqlite`
  as a client path (for example `/release/pvm`), next to the lock policy that protects it. It is
  set in Admin → File portal. In integration mode the portal resolves it under its own root and
  ignores `RELEASE_PVM`.
- **Portal tunables move into `admin.sqlite` (new).** `AUTH_SESSION_MINUTES`,
  `AUTH_MAX_FAILED_ATTEMPTS` and `AUTH_LOCKOUT_MINUTES` move into a settings table that the portal
  already re-reads every `ADMIN_SYNC_TTL_MS`, the same way navbar folders work. Changes take effect
  without a restart.
- **BREAKING (operator config)** `PORTAL_ROOT` is retired. The admin no longer reads or writes the
  portal's `.env`, and no longer edits `FILES_ROOT` or `AUTH_ENABLED`; both are host-local. The
  portal log is read from a new absolute `PORTAL_LOG_FILE`.
  `GET/PUT /api/v1/admin/portal/config` keep their shape and always answer "not linked"
  (`available: false` / `503`). New `GET/PUT /api/v1/admin/portal/settings` carry the logical
  settings. This is additive within v1 (ADR-007).
- **Portal paths stop depending on the release directory.** With `NODE_ENV=production` the portal
  refuses relative path variables. Its default data files live under a new `PORTAL_DATA_DIR`.
- **Schema v5** adds `integration_settings`. The portal's accepted ceiling rises from 4 to 5.
  Deploy order is portal first, then admin.

## Non-goals

- **Release on a separate volume that the admin can browse.** This change keeps the release folder
  inside the storage namespace. A release disk elsewhere is supported by mounting it inside
  `STORAGE_ROOT` (a Linux bind mount; no link resolution involved). A real multi-volume namespace
  (a `volumes` table and mount-aware `PathService`) is deferred until a deployment needs it. See
  design D3.
- **Several portal roots / tenants at once.** One portal root now. The table-per-tenant step is
  designed (D2) but belongs to `saas-identity-and-tenancy`.
- **Moving policies off path keys.** Renames inside a governed folder still orphan child policies
  (known limitation in the portal's integration doc). This change does not address it.
- Any change to how policies are decided.

## Impact

- **Admin:** `src/db/schema.js` (v5), a new `IntegrationSettingsService`, `PortalService` (log
  path, retired `.env` editing), `admin.routes.js` / `system.controller.js`, `public/assets/js/admin.js`
  (File portal pane), `.env.example`, `docs/CONTRACTS.md`, `docs/DATABASE.md`,
  `docs/DEPLOYMENT.md`, new `docs/decisions/ADR-010-cross-app-path-contract.md`, `AGENTS.md`.
- **Portal (`C:\PRO\files-server-web`, sibling change of the same name):** `lib/admin-db.js`
  (marker check, v5 read, release path), `lib/files-service.js` / `lib/api-router.js` (release
  from the database), `lib/auth-service.js` (tunables), path resolution for production,
  `docs/integration-admin-files-manager.md`, `.env.example`.
- **Operators:** one migration step. Upgrade the portal, upgrade the admin (it stamps the marker),
  set the release folder in Admin → File portal, then remove `PORTAL_ROOT` and `RELEASE_PVM` from
  config.
