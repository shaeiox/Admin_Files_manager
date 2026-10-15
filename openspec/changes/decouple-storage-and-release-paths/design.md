# Design

## Context

Two processes share one storage tree and one database:

```
admin (Dimension)                         portal (files-server-web)
  STORAGE_ROOT ── same bytes? ───────────── FILES_ROOT
  AFM_DATA_DIR/admin.sqlite ──── read-only ─ ADMIN_DB_PATH
  PORTAL_ROOT/.env  ◄── writes ──────────── (portal's own .env)
  PORTAL_ROOT/data/portal.log ◄── reads ─── LOG_FILE
                                            RELEASE_PVM (OS path, must be inside FILES_ROOT)
```

Today, three of those arrows depend on two paths being *equal*: `STORAGE_ROOT == FILES_ROOT`,
`RELEASE_PVM ⊂ FILES_ROOT`, and `PORTAL_ROOT` being the live portal folder. Nothing verifies
any of them.

Target:

```
admin.sqlite (shared, logical only)
  integration_settings: volume_id, release_client_path, portal auth tunables
  file_access_policies, portal_nav_folders, ... (unchanged, keyed by client path)

STORAGE_ROOT/.dimension-volume  ── same UUID ──  checked by portal at FILES_ROOT/.dimension-volume
```

Physical paths stay host-local: `STORAGE_ROOT`, `AFM_DATA_DIR` and `PORTAL_LOG_FILE` on the admin
side; `FILES_ROOT`, `ADMIN_DB_PATH`, `PORTAL_DATA_DIR` and `LOG_FILE` on the portal side. Neither
app ever writes the other's configuration.

## Decisions

### D1. Identify storage by a marker file, not by a path string

**Choice.** The admin owns a UUID in `integration_settings.volume_id` and the same UUID in
`STORAGE_ROOT/.dimension-volume`, a one-line JSON `{"volumeId":"<uuid>"}`. At startup, and on
every snapshot refresh (one small read every `ADMIN_SYNC_TTL_MS`), the portal reads
`FILES_ROOT/.dimension-volume` and compares it with the database.

The admin stamps it at startup:

| DB `volume_id` | Marker | Admin action |
|---|---|---|
| none | none | Generate a UUID, create the marker (`wx`, never overwrite), store the UUID |
| none | present | Adopt the marker's UUID (a reinstall over existing storage) |
| present | same | Nothing |
| present | none or different | **Do not write.** Report it in Admin → File portal (`volume.status: "missing" \| "mismatch"`). Log a warning. The admin keeps serving: its own function does not depend on the marker |

The last row deliberately does not re-stamp. A missing marker usually means `STORAGE_ROOT` now
points somewhere else, and stamping would bless the wrong directory. Recovery is a documented
manual step in `DEPLOYMENT.md`: write the marker with the stored UUID.

If the admin cannot write the marker (read-only root), it reports `status: "unwritable"` and keeps
running. The portal then refuses integration, which fails closed.

**Why it fits the codebase.**
- Dot-prefixed entries are already skipped by every listing and walk (`FileSystemService`).
- `validateFileName` already rejects a leading dot, so no client can create, rename or delete the
  marker. No new reserved-name rule is needed. Only a test pinning this is needed.
- The portal must also skip dot-entries in listings and search, and refuse them on
  download/hash/ZIP. Verify this in its task list.

**Rejected alternatives.**
- Compare `realpath`s: impossible across hosts or containers.
- Compare device + inode: not portable to Windows/SMB and differs across mounts.
- Store a root path in the database: that is the bug in a different place.

### D2. Mapping stays `"/" + rel`, but it is now verified

The marker only exists at the storage root, so a matching marker proves `FILES_ROOT` is the admin
root. The existing mapping is then correct by construction. A configurable client-path prefix
(serving a subtree) is a non-goal: the portal could not see the marker from a subtree mount. Add it
with a per-subtree marker if a deployment ever needs it.

### D3. The release folder is a client path in the database

**Choice.** `integration_settings.release_client_path` (nullable) is set in Admin → File portal. It
is validated like `PortalNavService.normalizePath` and must be an existing folder. In integration
mode the portal:
- resolves it under `FILES_ROOT` through its normal secure resolution;
- ignores `RELEASE_PVM`, with a startup warning if it is set (same pattern as `ADMIN_STORAGE_ROOT`);
- applies the lock exactly as today: `releaseRootDecision` decides `release_client_path` (+ `/el8`,
  `/el9`).

Legacy mode (no admin integration) keeps `RELEASE_PVM` unchanged.

"Release outside the root, protection switches off" can no longer happen: the path is inside the
namespace by definition. A null release path means "no dedicated release folder", the same as an
unset `RELEASE_PVM` today.

**Separate release disk (ceiling).** Mount it inside `STORAGE_ROOT`, for example
`mount --bind /mnt/releases /srv/dimension/storage/release`. A bind mount is not a link, so both
apps' realpath containment accepts it. A Windows junction is a link, and both apps correctly refuse
it. A native multi-volume namespace (`volumes` table, one marker per volume, mount-aware
`PathService` in the admin so the release disk is browsable and lockable) is the upgrade path. It
is deferred because it touches the admin's single path choke point (`resolveSecurePath`) and no
current deployment needs it.

### D4. Portal tunables move to the database; `.env` editing is retired

**Choice.** `integration_settings` holds `portal.auth_session_minutes`,
`portal.max_failed_attempts` and `portal.lockout_minutes`, with the same ranges `PortalService`
validates today. In integration mode the portal uses database value → its env value → built-in
default, re-read each snapshot. `AUTH_ENABLED` is not editable: integration mode already requires
`true`. `FILES_ROOT` is not editable: it is host-local.

`GET/PUT /api/v1/admin/portal/settings` (new) serve `{ volume, releaseClientPath, auth }`. A read
is bare and a write is enveloped (AGENTS rule 6). `volume` is read-only status
(`{ id, status }`).

`GET/PUT /api/v1/admin/portal/config` stay mounted with unchanged shapes. They always report the
existing "not linked" state (`available: false`, `reason` names the new endpoint; `PUT` → `503`).
This removes the capability without retyping a v1 response (ADR-007: additive only). The `.env`
writer in `PortalService` is deleted.

### D5. Portal log location is configured, not derived

`PORTAL_LOG_FILE` (absolute) replaces `path.join(PORTAL_ROOT, 'data', 'portal.log')`. If it is
unset, `GET /admin/logs/portal` reports "not linked" exactly as it does today. The operator points
it at the same file as the portal's `LOG_FILE`. `PORTAL_ROOT` has no remaining reader, so it is
removed. If it is still set, the admin logs that it is ignored.

### D6. Portal paths are independent of its code directory

- `PORTAL_DATA_DIR` (absolute; default `<project>/data` outside production) is the base for
  `users.json` and `portal.log` defaults.
- With `NODE_ENV=production`, relative `FILES_ROOT`, `ADMIN_DB_PATH`, `LOG_FILE`,
  `AUTH_USERS_FILE` and `RELEASE_PVM` refuse startup. Outside production they still resolve
  against the project root, to keep development unchanged.

This mirrors the admin's `AFM_DATA_DIR` rule (ADR-008).

### D7. Schema v5 and rollout order

Migration 5 creates `integration_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. A key/value
table fits the handful of scalar settings. The portal validates every value it reads (an invalid
value means use the fallback, logged once). It never trusts the database blindly.

The portal's schema gate rises to `≤ 5`, and the portal reads v4 databases as before: with no
table, there is no volume check in v4-compat mode and it logs a warning.
- **Order:** deploy the portal first (it accepts v4 and v5), then the admin (migrates to v5 and
  stamps the marker), then set the release folder in Admin → File portal, then remove `RELEASE_PVM`
  and `PORTAL_ROOT`.
- The v4-compat bypass of the volume check is removed in the next portal release after rollout.
  Track it as a task, not a flag.

## Risks

| Risk | Mitigation |
|---|---|
| The marker is deleted out of band, so the portal refuses integration | Fail-closed is intended. The Admin → File portal status shows `missing`, and the recovery step is documented |
| Operator forgets to set the release folder after upgrade, so releases are not under a dedicated folder | Startup warning in the portal while integration is on and `release_client_path` is null but `RELEASE_PVM` is set. Upgrade note in both docs |
| Portal reads v5 values outside their range | Validated per key, fallback to env/default, logged once |
| `SQLITE_BUSY` on the new table | Same single read transaction per snapshot as today; no new contention |

## Open question

- Should the admin offer a **"Re-stamp storage"** action for the `missing` state instead of the
  manual step? Deferred: it lets one click bless a wrong directory, which is the failure D1 exists
  to prevent.
