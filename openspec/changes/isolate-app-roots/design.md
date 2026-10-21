# Design

## Context

Today (reference host):

```
/opt/                                   ← STORAGE_ROOT (admin) = FILES_ROOT (portal), marker here
├─ devel/Projects/Admin-Files-Manager-fixed/   admin code
│   └─ data/admin.sqlite  ◄──────── read-only SQL ─────── portal  ADMIN_DB_PATH
└─ devel/PRO/files-server-web/                 portal code
    └─ data/portal.log    ◄──────── fs read ──────────── admin   PORTAL_LOG_FILE
```

Three problems follow from this layout:
- Both code folders and their state are inside the served storage.
- Each app names a path inside the other's code folder.
- The portal depends on this app's private schema.

Target:

```
<anywhere>/admin-code  (read-only)          <anywhere>/portal-code  (read-only)
   env: /etc/dimension/dimension.env           env: /etc/files-portal/portal.env
   state: AFM_DATA_DIR (/var/lib/dimension)    state: PORTAL_DATA_DIR (/var/lib/files-portal)
        │                                            │
        │◄── GET  /api/v1/integration/portal/snapshot (Bearer token, ETag) ──┤
        │◄── POST /api/v1/integration/portal/credentials/verify ─────────────┤
        ├── GET  <portal>/api/ops/log           (Bearer token) ─────────────►│
        ├── POST <portal>/api/ops/access-check  (Bearer token) ─────────────►│

/srv/dimension/storage   ← STORAGE_ROOT / FILES_ROOT; holds no code and no app state
```

The only things that cross between the apps are **a URL and a token on each side** and the
**storage bytes**. The storage keeps the ADR-010 `.dimension-volume` identity.

## Decisions

### D1. "Relocatable" is defined by a test, not by a convention

An application is relocatable when its code folder can be copied to a random path (for example
`/tmp/x-<uuid>/any name/`), made read-only, and still pass its test suite and a smoke start. The
smoke start is configured only through env values that point outside the code folder. Every rule
below exists to make that test pass, and CI runs it (D7).

### D2. State outside the code folder; refuse overlap

Production startup refuses when either of these holds:
- `AFM_DATA_DIR` resolves (after `realpath`) inside the code folder (`path.resolve(__dirname)`).
- `STORAGE_ROOT` contains, or is contained by, the code folder or `AFM_DATA_DIR`.

Development only warns, so `./data` keeps working.

Rejected: hiding `data/` folders by name in the file browser. That is a policy patch that misses
renamed folders, and it would still let the admin delete its own code.

### D3. Storage moves to a dedicated tree (operator step)

The volume id stays the same, and the marker moves with the bytes. Per ADR-010 a stored id is never
re-stamped. If the storage is moved together with its `.dimension-volume`, nothing else changes. If
the storage is a fresh folder, the runbook copies the marker file before the first start.

### D4. Contract: versioned snapshot over HTTP, not shared SQL

`GET /api/v1/integration/portal/snapshot` is answered by a new `PortalContractService`. It reads
through the existing repositories in one read transaction and returns:

```
{ contract: 1, volumeId, publishedRoot, releaseClientPath,
  auth: { sessionMinutes, maxFailedAttempts, lockoutMinutes },
  users:  [{ id, username, role, status, lockedUntil, credentialStamp, sessionsRevokedAt }],
  policies: [{ clientPath, isDirectory, accessMode, isPublished, isLocked,
               availableFrom, availableUntil, defaultLevel }],
  userGrants: [...], groupMembers: [...], groupGrants: [...],
  nav: [{ clientPath, label, hideFromHome }] }
```

The endpoint behaves as follows:
- **ETag and caching.** The `ETag` is a hash of the body. The body carries no generation time,
  so it only changes when the data does. `If-None-Match` answers `304`, so polling every 5 s
  stays cheap. `Cache-Control: no-store` is set.
- **Compatibility.** `contract` is the compatibility number. Additive fields keep it; removing or
  retyping a field bumps it. The portal accepts every version up to the newest it knows. Schema
  migrations here no longer affect the portal.
- **No password hashes.** `credentialStamp` is an opaque value that changes when the password
  changes. It is a domain-separated sha256 of the salted scrypt record, not keyed by the token, so
  rotating the token never ends sessions. The salt is never sent, so the stamp cannot be used to
  test guesses. It replaces the portal's `pwFingerprint`, so a password change still ends existing
  portal sessions.
- **Mount point.** The endpoint is outside `authenticate` and `csrf`. It has its own router
  mounted before them, uses its own rate-limit bucket, and is reachable only with the token (D5).

Alternative kept for hosts that cannot open HTTP between the apps: the admin writes the same JSON
document atomically to `AFM_EXPORT_DIR/portal-contract.json` (write to a temp file, then `rename`),
and the portal reads it by path. It is the same contract over a different transport. This is optional and off by
default.

Rejected:
- SQL views (`portal_v1_*`) in `admin.sqlite`. They keep the same-host and `-shm` permission coupling.
- A separate exported SQLite file. It has the same transport problem and is more work than JSON.

### D5. Service token

- **Value.** `AFM_PORTAL_SERVICE_TOKEN` must be at least 32 characters. It is compared with `timingSafeEqual` on
  `Authorization: Bearer`. The portal holds the same value as `ADMIN_SERVICE_TOKEN`.
- **Startup.** Unset means the integration routes answer `404`, so this app works standalone. Set but too short
  refuses startup.
- **Rotation.** The token may be a comma-separated list of two values, to allow rotation without downtime.
- **Audit.** Calls are not written to `audit_logs`, because that would add a row every 5 s. A token
  failure is logged and rate-limited.

### D6. Credentials are verified here

`POST /api/v1/integration/portal/credentials/verify {username, password}` returns
`200 {userId, credentialStamp}` or `401`. It uses the same bcrypt code, the same lockout and status
rules, and the existing login rate limiter, keyed by the portal's forwarded client IP only when the
peer is trusted. The portal keeps its own throttling as well.

Trade-off: portal sign-in now needs this app to be up. That is acceptable, because portal
integration mode already fails closed without a fresh snapshot.

### D7. Logs and access check: the owner answers

- **Logs.** `PortalService.getLog` calls `GET <AFM_PORTAL_URL>/api/ops/log?limit=` when `AFM_PORTAL_URL` is set.
  Otherwise it falls back to `PORTAL_LOG_FILE` and logs a deprecation warning once.
- **Access check.** "Check access" calls the portal's `/api/ops/access-check`. Then `portalKey` and `portalAccess`
  are deleted here. The decision code had two copies; now it has one owner.
- **Drift.** A JSON fixture set (`test/contract/portal-v1/*.json`: input snapshot, path, user, expected
  decision) is committed to both repos. Each repo's test checks its own side against it.

### D8. Relocation CI

This job runs in both repos, as part of `production-cicd-readiness`:
1. `cp -a` the repo to `$(mktemp -d)/"relocated app"/`, then `chmod -R a-w` it.
2. Run `npm test` in the copy, with `AFM_DATA_DIR` and `STORAGE_ROOT` in other temp folders.
3. Smoke-start the app and check `GET /api/health`.
4. Lint: fail on any reference to the sibling repo name, `../` outside `node_modules`, or an absolute
   `D:\`, `E:/`, `/opt/devel` path in `src`, `test`, `scripts` or `docs`.

A joint job (optional, portal repo) starts both apps from unrelated temp folders, linked only by
URL and token, and runs one governed download.

## Migration

| Step | Who | Effect |
|---|---|---|
| 1 | Ship this change's endpoints | Additive. The portal still reads SQLite. |
| 2 | Ship the portal's HTTP source | The portal uses HTTP when `ADMIN_API_URL` is set, otherwise SQLite. |
| 3 | Operator: move `AFM_DATA_DIR` / `PORTAL_DATA_DIR` out of the code folders, move the storage, set tokens/URLs | Each app now names only its own paths. |
| 4 | Next release | Portal SQLite source and `ADMIN_DB_PATH` are removed. `PORTAL_LOG_FILE` is removed here. |

## Risks

- **Token leak.** A leaked token exposes the user list and the policies, but no hashes. Mitigations: the endpoint binds
  through the same nginx with an allow-list, and the token can be rotated (D5).
- **Snapshot size on large policy sets.** `304` covers the steady state. Measured on 2026-10-21
  (task 2.6):
  - Reference database (3 users, 5 policies, 4 grants): 2.1 KB, built in 0.4 ms.
  - Synthetic 10,000 policies: 2.0 MB, built in 59 ms.

  Each poll still builds the document to compute its ETag, which costs about 60 ms every 4 s at
  10k policies. Paginate, or cache the ETag per write, only if the body exceeds about 5 MB.
- **Sign-in availability.** Covered in D6.

## Open question

Should `AFM_EXPORT_DIR` (the file transport in D4) be built in v1, or only when a host actually needs it?
Default assumption: **not built in v1**. It is documented as a contract-compatible extension.
