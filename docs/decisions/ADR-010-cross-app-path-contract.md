# ADR-010 — Cross-App Path Contract with the File Portal

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Project maintainer
- **Tags:** integration, deployment, security
- **Change:** `openspec/changes/decouple-storage-and-release-paths` (sibling change of the same name in `files-server-web`)

## Context

The File Portal enforces this app's file-access policies (ADR-009). It reads `admin.sqlite`,
where a policy is keyed by a client path relative to `STORAGE_ROOT`, and it maps its own paths
with `"/" + path relative to FILES_ROOT`. The two only agree when `FILES_ROOT` and `STORAGE_ROOT`
are the same directory. That was a comment in the portal's `.env.example`, never a check.

A mismatch fails **open**. A path with no matching policy is ungoverned, and the portal allows it.
Examples: a parent or child directory, another mount of the same share, a UNC path vs a drive
letter, a container path vs a host path.

Three more couplings followed from the same idea:
- `RELEASE_PVM` was an OS path that had to sit inside `FILES_ROOT`, or release protection
  silently switched off.
- This app wrote the portal's `.env` through `PORTAL_ROOT`. That assumes a mutable project folder,
  contradicts immutable releases (ADR-008), lets an admin set `FILES_ROOT` to anything, and only
  applies after a restart.
- This app read `<PORTAL_ROOT>/data/portal.log` at a hard-coded path.

## Decision

1. **The two apps share logical identifiers only, through `admin.sqlite`.** Physical paths stay
   in each app's own host configuration. Neither app writes the other's configuration.
2. **Storage identity is a marker, not a path.** This app stores a UUID in
   `integration_settings.volume_id` and in `STORAGE_ROOT/.dimension-volume`. In integration mode
   the portal reads the marker from its `FILES_ROOT` at startup and on every refresh, and refuses
   on a mismatch. A stored id is never re-stamped: a missing marker more likely means
   `STORAGE_ROOT` moved, and stamping would bless the wrong directory. The marker is reserved:
   `PathService.resolveSecurePath` answers `404` for it by any spelling, so no endpoint can read,
   rename, move, copy or delete it.
3. **The portal locates itself; no path or setting has to match.** It canonicalises its
   `FILES_ROOT`, climbs to the outermost storage-root marker of this volume, and decides every
   path as `join(<folder it found itself in>, rel)`. Policies on that folder and on every ancestor
   keep applying, because the portal decides full admin client paths. Moving `FILES_ROOT` changes
   which files are served, never which policy governs a file. A host that cannot see the storage
   root trusts one more marker, the optional **portal folder** this app publishes
   (`portal_root_client_path`). Any other subfolder marker, such as a copy that travelled with its
   folder, is ignored. No trusted marker: the portal refuses (fail closed).
4. **The release folder is a client path** (`integration_settings.release_client_path`), next to
   the lock policy that protects it. "Release outside the root" is impossible by construction.
5. **Portal auth tunables live in `integration_settings`.** The portal re-reads them every
   `ADMIN_SYNC_TTL_MS`, so no restart is needed.
6. **`PORTAL_ROOT` is retired.** `GET/PUT /api/v1/admin/portal/config` keep their v1 shapes and
   always answer "not linked" (ADR-007: no v1 response is retyped). The portal log is read from
   `PORTAL_LOG_FILE`.

## Consequences

- The storage, the release folder, and both apps' release directories can each live anywhere.
  The integration works or refuses loudly; it no longer degrades to public.
- **Rollout order matters.** Deploy the portal first (it accepts admin schema v4 and v5), then
  this app (migration 5, stamps the marker), then set the release folder, then remove
  `PORTAL_ROOT` and `RELEASE_PVM`. A v4 database cannot prove the volume: the portal logs that and
  runs as before for one release.
- This app now writes one file into `STORAGE_ROOT` on first start. On a read-only root,
  `volume.status` is `unwritable` and the portal refuses integration (fail closed).

## Not decided here (ceilings)

- **A release volume elsewhere that this app can browse.** Today it is mounted inside
  `STORAGE_ROOT` with a Linux bind mount. A bind mount is not a link, so containment accepts it;
  a Windows junction is a link and is refused. A native multi-volume namespace (a `volumes` table,
  one marker per volume, mount-aware `PathService`) is the upgrade path. It touches the single path
  choke point and waits for a deployment that needs it.
- **SaaS tenants.** Any number of portals may already serve different folders of one storage when
  their hosts see the storage root. Isolated hosts need one published folder each: the next step
  is a `portal_roots` table (`tenant_id, client_path`), each row with its own marker. This belongs
  to `saas-identity-and-tenancy`.
- **An 8.3 short name** for the marker on a Windows volume with 8.3 names enabled is not refused
  by name (marked `ponytail:` in `PathService`).
