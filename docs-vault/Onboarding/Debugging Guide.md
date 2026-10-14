---
title: Debugging Guide
type: onboarding
language:
  - javascript
status: generated
complexity: medium
dependencies:
  - "[[Server Bootstrap and Config]]"
  - "[[HTTP API Layer]]"
  - "[[Auth and Access Control]]"
related-notes:
  - "[[Getting Started]]"
  - "[[First Contribution]]"
  - "[[Health Summary]]"
  - "[[Limitations]]"
  - "[[Code Review]]"
  - "[[Error Contract and Sanitization]]"
  - "[[Concurrency and Consistency]]"
  - "[[Metadata and Settings Stores]]"
  - "[[Storage Services]]"
canonical-source: src/middlewares/errorHandler.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - onboarding
---

# Debugging Guide

This note lists the common failures, what each one means, and where to look.

> [!tip] Prerequisites
> - You can run the server locally ([[Getting Started]]).
> - You know the response envelope: errors are always `{ success: false, error: string }`.

## Where errors surface

| Where | What you see |
|---|---|
| **Boot console** | `FATAL CONFIGURATION ERROR: <problem>`, one line per problem, then exit code 1. Printed by `server.js` from `config.validateStartup()`. |
| **Request log** | `morgan('dev')` writes one line per request to stdout: method, path, status and time. Nothing is persisted, and there is no log file. |
| **Error log** | `errorHandler` (`src/middlewares/errorHandler.js`) prints `[ERROR] <METHOD> <path> >> <stack or message>` with `console.error`. The client gets only the sanitized `{ success: false, error }`. |
| **Browser** | `window.API` rejects with `status` and `kind`. A `401` triggers a redirect to `login.html`. Pages show a toast unless they called with `{ silent: true }`. |
| **Production** | The systemd journal for `dimension.service`. See `docs/DEPLOYMENT.md`. |

## Common failures

### The server will not boot

`validateStartup()` refuses to start when:

- `STORAGE_ROOT` is missing, relative, spelled for the other platform (for example `C:\...` on Linux), or does not exist or cannot be read.
- `UPLOAD_MAX_BYTES` or `AFM_UPLOAD_FREE_SPACE_BYTES` is not a valid integer.
- `NODE_ENV=production` without `AFM_DATA_DIR`.
- A CORS origin is malformed or duplicated, or the wildcard is used in production.
- Only one of `AFM_BOOTSTRAP_ADMIN_USERNAME` / `AFM_BOOTSTRAP_ADMIN_PASSWORD` is set.

Boot can also fail with a stack trace (not a FATAL line) when the SQLite migration refuses a schema version newer than the code understands.

> [!warning] What `validateStartup` does not check
> - `PORT` is not validated. `PORT=abc` makes Node listen on a pipe path with no TCP port, and an out-of-range value throws a raw `RangeError`.
> - Directory checks test readability, not **writability** (`dir-checks-skip-writability`). A read-only root boots fine, and writes then fail at runtime.

### 401 Authentication required

There is no valid session: no `afm_session` cookie or `Authorization: Bearer` token, an expired one (flat 24 h), or a revoked one. Only `GET /health` and `POST /auth/login` are public. If the login itself fails, check whether the bootstrap admin was ever created (the env pair must be set on a boot when no admin existed). Also check the login rate limit and the 10-failure lockout. A known bug means the lockout can re-arm after it expires (`lockout-rearms-after-expiry`).

### 403 responses

| Message | Cause |
|---|---|
| `Missing or invalid CSRF token.` | A non-GET request without a matching `X-CSRF-Token` header. The ZIP form POST sends a `csrfToken` body field instead. Usually the request bypassed `window.API`, or the token was lost after a reload or re-login. |
| `Access denied. Path traversal detected.` | `PathService.resolveSecurePath` rejected a path that resolves outside `STORAGE_ROOT`. Check how the client path was built: it must be POSIX and rooted at `/`. |
| `Administrator access required.` | The route is under `/api/admin` and the user is not an admin. |
| `Permission denied.` | The OS refused access (`EACCES`/`EPERM`) on a real file. |

A malformed path is a `400` (`Invalid path format provided.`). A NUL byte in a client path currently produces a `500` (`nul-in-client-path-500`).

### 409 on upload, rename or create folder

The target name already exists. Uploads refuse to overwrite unless the multipart field `overwrite` is exactly `"true"`. **Send `destination` and `overwrite` before `file`** in the multipart body. Related upload statuses: `507` means free space is below `AFM_UPLOAD_FREE_SPACE_BYTES`, `429` means more than `AFM_UPLOAD_MAX_CONCURRENT` uploads (or the rate limit), and `413`/size errors mean the body exceeded `UPLOAD_MAX_BYTES`. Abandoned staging files are named `.upload-*.part` inside the root.

### 500 "Metadata store could not be read"

`data/metadata.json` (under `AFM_DATA_DIR`) is corrupt or unreadable. `MetadataService._read` throws, and any endpoint that reads it answers `500`. Inspect or move the file aside; it is recreated lazily on the next write. Settings work the same way (`settings.json`, corrupt → `500`). Possible causes:

- Concurrent writes share one fixed `.tmp` path (`shared-tmp-write-race`).
- A failed write leaves memory ahead of disk (`cache-mutated-before-write`).
- Two processes on the same `AFM_DATA_DIR`. The stores assume they are the only writer.

### Dashboard shows `—` or nulls

This is by design, not a bug. `GET /api/dashboard/summary` returns `200` even when part of the data could not be measured:

- `storage.usedBytes`/`totalBytes` become `null` with `volumeAvailable: false` when `statfs` fails.
- The tree walk is capped at 100k entries / 2000 ms and reports truncation. Unreadable subdirectories are skipped.

The client renders each unknown value as `—`. Check the `*Available` flags before suspecting the UI. One caveat: AGENTS.md says a metadata failure is a `500`, but the controller currently turns it into an **unlogged empty list** (`dashboard-metadata-silent-empty`). An empty activity panel can therefore hide a broken store.

## How tests isolate stores

- Test files run in **parallel processes**. A suite that boots the server repoints, *before* requiring `server.js`:
  - `MetadataService.dbPath`, at a temp file.
  - `SettingsService.dbPath` and its in-memory cache, if the suite touches settings.
  - `AdminDatabase.dbPath` (`src/db/connection.js`), which can be redirected the same way.
- `validateStartup(source)` takes an injectable environment, so config tests never need a real `.env`. `env.js` never exits at require time.
- Other test seams: `reset()`, `PreviewService._useTransformer`, `UploadService._useFreeSpaceReader`.
- Two suites once wrote the real store and corrupted it. If `data/*.json` changes after `npm test`, a suite is missing its redirect.

## Known bugs worth knowing

These come from [[Health Summary]] and [[Code Review]]:

- **Symlink escape on mutations (high).** Create-folder, rename, move and copy use only the lexical guard, so an in-root symlink or junction lets a write escape `STORAGE_ROOT`.
- **Path-keyed state drifts.** Renaming or deleting a folder leaves its descendants' metadata and access-policy rows behind (`rename-delete-ignore-descendants`, `policy-path-hooks-exact-match`).
- **Raw error leaks in bulk operations.** `bulk-raw-error-leak` puts raw `err.message` into `failed[]` and can expose absolute paths. Streaming endpoints have no `headersSent` guard in `errorHandler`.
- **Invisible download failures.** Iframe transports swallow errors (`download-errors-invisible`).
- **Shutdown.** A second signal (SIGTERM then SIGINT) logs a clean exit with code 0 while transfers are cut off (`double-signal-false-clean-exit`).
- **Login redirect.** The open-redirect guard can be bypassed with a backslash (`login-open-redirect-backslash-bypass`).
- **Deploy.** A manual rollback exits 0 even on an unhealthy release (`manual-rollback-no-restore`).

For the full list and severities, see [[Health Summary]], [[Limitations]] and [[Concurrency and Consistency]].
