# Proposal

Sibling of the File Portal change of the same name (`openspec/changes/isolate-app-roots` in the
portal repository). This file holds the full analysis and decisions (D1–D8). The portal's
artifacts cover only its own side.

## Why

ADR-010 removed the *logical* path coupling (volume marker, client paths, no `.env` editing). The
two applications are still *physically* coupled, so neither root folder can be moved, renamed or
deployed on its own:

- **Each app's state sits inside its code folder, and the other app names that folder.** The portal's
  `ADMIN_DB_PATH` points to `<admin repo>/data/admin.sqlite`. This app's `PORTAL_LOG_FILE` points to
  `<portal repo>/data/portal.log`. Moving or renaming either folder breaks the other app without
  any warning.
- **The served storage contains both applications.** On the reference host
  `STORAGE_ROOT = FILES_ROOT = /opt/`, which holds both repositories. The portal hides only
  dot-entries, so `…/data/admin.sqlite` (bcrypt hashes), `metadata.json`, the portal's state database
  and both source trees can be listed and downloaded unless a policy happens to cover them. The file
  manager can delete either application, including itself.
- **The portal reads this app's private tables.** `lib/admin-db.js` reads `users`, `files`,
  `file_access_policies`, the grant and group tables, `audit_logs`, `portal_nav_folders` and
  `integration_settings` directly. As a result:
  - Every schema migration here is a breaking change for the portal (it refuses `version > KNOWN`).
  - The two apps must share a host, a filesystem, and permission to write the `-shm` file of a WAL database.
  - The access-decision rules exist twice (`FileAccessPolicyService.portalKey/portalAccess` here mirror the
    portal's `access-policy.js`).
- **This app reads the portal's log by file path.** That again needs the same host and filesystem.

The import graph confirms there are no code imports between the two repositories. Every coupling
above is configuration, file layout, or a shared file.

## What Changes

- **State never lives in the code folder (production).** `AFM_DATA_DIR` must be absolute and must not
  be inside the application's own code folder. Development keeps the `<cwd>/data` fallback.
- **Storage never overlaps an application (new startup check, refuse).** `STORAGE_ROOT` must not
  contain, or sit inside, this app's code folder or `AFM_DATA_DIR`. The portal adds the same check
  for its own folders.
- **Integration contract v1 over HTTP (new).** `GET /api/v1/integration/portal/snapshot` returns
  everything the portal needs as one versioned JSON document with an `ETag`. It is authenticated by a
  service token (`AFM_PORTAL_SERVICE_TOKEN`), not by a user session or CSRF. The document carries
  no password hashes.
- **Credential check over HTTP (new).** `POST /api/v1/integration/portal/credentials/verify` checks a
  portal sign-in against this app's users. The portal no longer receives bcrypt hashes.
- **Portal log via the portal's API (new).** Admin → Logs → File portal reads
  `GET <AFM_PORTAL_URL>/api/ops/log` with the same token. `PORTAL_LOG_FILE` stays as a deprecated
  fallback for one release.
- **One owner for access decisions.** "Check access" asks the portal
  (`POST <AFM_PORTAL_URL>/api/ops/access-check`). The mirrored decision code here is deleted, and
  shared contract fixtures prevent drift.
- **The shared database read is retired** one release after the portal ships the HTTP source.
  Until then `admin.sqlite` stays readable as before (compatibility only).
- **Hygiene.** Remove the stale `PORTAL_ROOT` from local `.env` files. Remove machine-specific paths
  (`D:\…`, `E:/GitServer/…`) from tests and docs. Remove the stray `~/` folder and the root
  `portal.log` from this working copy.

## Capabilities

- **New** `app-root-isolation`: the code folder is relocatable and read-only; state lives in configured
  folders; storage does not overlap any application.
- **New** `portal-integration-contract`: the versioned HTTP contract (snapshot, credential check, the
  portal log and access check consumed by this app).

## Impact

- Code: `src/config/env.js`, `src/config/dataDir.js`, `server.js`, new `src/routes/integration.routes.js`
  and `src/services/PortalContractService.js`, `src/services/PortalService.js`,
  `src/services/FileAccessPolicyService.js`, `src/controllers/system.controller.js`.
- Config: `AFM_PORTAL_SERVICE_TOKEN`, `AFM_PORTAL_URL` (new); `PORTAL_LOG_FILE` (deprecated).
- Docs: ADR-011, `docs/DEPLOYMENT.md`, `docs/CONTRACTS.md`, `.env.example`, systemd unit.
- **Rollout order:**
  1. This app's contract endpoints (additive).
  2. The portal's HTTP source, with the SQLite source kept as fallback.
  3. Operators move state and storage.
  4. One release later, the shared-DB read is removed.

## Non-goals

- Multi-host storage replication. Both apps still serve the same bytes, and the storage is the one legitimately
  shared resource.
- Push notifications or webhooks; the portal keeps polling every `ADMIN_SYNC_TTL_MS`.
- mTLS. A bearer token over loopback or TLS is enough for v1.
- Any change to access rules.
