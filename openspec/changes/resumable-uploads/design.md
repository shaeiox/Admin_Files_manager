# Design

## Context

See `proposal.md` — Why. What shapes the approach:

- **The upload path today is a single multipart `POST`.** `UploadService` streams a request body to a hidden staging file (`.upload-<hex>.part`) inside the destination directory through `multer` `diskStorage`, then `commit()` renames it to the final name on the same volume. `UPLOAD_MAX_BYTES` (default 5 GiB) is enforced in a `fileFilter`; free space is pre-checked through `_assertFreeSpace` / `_useFreeSpaceReader` (a test seam); a concurrency counter bounds parallel uploads. `discard()` removes staging, and on Windows retries the unlink because handles can lag.
- **The frontend queue is one XHR per file** (`public/assets/js/uploads.js` → `API.upload` in `api.js`). It has no notion of partial progress: pause tears down the request and the copy says "Restarts from the beginning when resumed". Failure kinds already come from machine-readable signals (status, `kind`, transport), never message text.
- **Every `POST`/`PUT`/`PATCH`/`DELETE` under `/api` counts against one 60-per-minute per-IP write bucket** (`src/middlewares/rateLimit.js`, `AFM_RATE_LIMIT_WRITE_PER_MINUTE`). A 5 GiB upload is one request today; chunking naively would turn it into 640 requests and trip the bucket in seconds.
- **Store conventions.** JSON stores (`metadata.json`, `settings.json`) live under `AFM_DATA_DIR`, use atomic temp-file-then-rename writes, and expose a `dbPath` (+ cache) test seam so suites never touch real files. `admin.sqlite` is identity data and a shared contract with the File Portal (ADR-010) — not a place for upload sessions. The runtime manifest is pinned to seven packages, and the frontend has no build step.
- **Deployment contract (ADR-008):** one Node process, 30 s shutdown drain, `requestTimeout = 0`, nginx in front with a body limit already above the 5 GiB ceiling. `/api/v1` is the contract; `/api` is a compatibility alias served by the same assembly (ADR-007, additive-only within v1).

## Goals / Non-Goals

**Goals:**

- An interrupted transfer (failed request, pause, browser reload, server restart) continues from the last byte the server acknowledged — for files up to the configured ceiling.
- The server is the only authority on progress; no client claim can move the offset.
- Partial data never masquerades as a file: nothing visible before completion, nothing left after abandonment or expiry, nothing merged from two different files.
- The whole surface is additive in `/api/v1` with no new runtime dependency, no new required env var, and no nginx or deployment change.

**Non-Goals:**

- Content verification: no streaming SHA-256 of multi-GiB files (browsers cannot read a File slice-wise at scale, and the memory-bounded alternative does not exist in the platform). Identity is the browser's own fingerprint fields (see D8).
- Parallel chunk upload for one session, multi-instance coordination, and a server-side session-listing UI. Chunks are sequential; the deployment is one process; recovery works by re-selecting the file.
- Changing the legacy single-request upload path, the Files page, metadata, or the dashboard.

## Decisions

### D1 — Application-level chunked session protocol, not a library

Five endpoints under `/fs/uploads` implement initiate → append → status → complete → abort. **Alternatives rejected:** *tus.io* — an eighth runtime dependency for a surface this small, and it brings its own auth/patch/MD5 extension model that would have to be reconciled with the existing cookie + CSRF + `authenticate` stack; *raw `Content-Range` PUTs* — no place to carry governance (TTL, declared size, overwrite authorization, hidden staging) without inventing an equivalent session object anyway; *keeping single-shot uploads* — fails the goal.

### D2 — The resume offset is the staged file's size, read fresh

`receivedBytes` is `stat(staging).size` at request time, never a stored counter and never a client-reported offset. **Alternatives rejected:** *per-chunk bitmap or journal* — write amplification for no benefit when appends are sequential and validated against the current size anyway; *client-trusted offset* — a bug or a hostile client could gap or overlap the file.

### D3 — Session records in a new JSON store, `UploadSessionService`

`data/upload-sessions.json` (under `AFM_DATA_DIR`), owned by a new `UploadSessionService` that mirrors the `SettingsService` pattern exactly: singleton with `dbPath` + in-memory cache test seams, atomic temp-file-then-rename writes, bounded document. Record shape:

```
{ id, destination, name, size, lastModified, overwrite,
  state: "open" | "completed", createdAt, updatedAt, completedAt? }
```

`receivedBytes` is not stored (D2). `updatedAt` is the TTL basis (renewed by appends, not by reads). **Alternatives rejected:** `admin.sqlite` — migrations and a schema shared with the File Portal contract (ADR-010) for data the portal must never see; `metadata.json` — that store is explicitly fire-and-forget and owns downloads/stars/activity, not transfer state; *sidecar files* — per-file clutter inside operator-visible trees, no index to sweep, and they would surface next to user content.

### D4 — Staging stays in the destination directory, hidden, named per session

Staged bytes live at `<destination>/.upload-<sessionId>.part` — the same convention and same-volume-rename reason as `UploadService`, already hidden from `list` and `tree` by the dotfile filters. `sessionId` is 32 hex chars from `crypto.randomBytes(16)` (unguessable, filesystem-safe). **Alternatives rejected:** *a central staging directory* — `EXDEV` on commit, free space measured on the wrong volume, and a second placement path to audit; *appending into a visible temp name* — violates the repo invariant that nothing partial is ever presented as a file.

### D5 — Endpoint surface and contracts

All five are mounted inside the existing `fs.routes.js` (served on `/api/v1` and `/api` by the one assembly), behind the blanket `authenticate` + CSRF middleware, and follow rule 6: mutations enveloped, the status read bare.

| Endpoint | Body / params | Success | Notable refusals |
|---|---|---|---|
| `POST /fs/uploads` | JSON `{destination, name, size, lastModified, overwrite}` | `200` envelope `{success, sessionId, receivedBytes, expiresAt}` | `400/403` destination invalid · `409` target exists without authorization (parity with the legacy early refusal) · `413` size over ceiling · `507` free space |
| `PUT /fs/uploads/:id/chunk?offset=N` | `application/octet-stream` stream | `200` envelope `{success, receivedBytes}` | `404` unknown/expired · `409 offset_mismatch` (carries current `receivedBytes`) · `413 chunk_too_large` / `413 size_exceeded` · `507` |
| `GET /fs/uploads/:id` | — | bare `{id, destination, name, size, receivedBytes, state, expiresAt}` | `404` unknown/expired |
| `POST /fs/uploads/:id/complete` | JSON `{overwrite}` optional re-assert | `200` envelope `{success, path}` | `404` · `409 session_incomplete` · `409 destination_conflict` (session kept) |
| `DELETE /fs/uploads/:id` | — | `200` envelope | `404` unknown (client treats as aborted) |

`POST /fs/uploads` is **idempotent per fingerprint** `(destination, name, size, lastModified)`: matching an open session returns it with its `receivedBytes` (a client that died right before `complete` sees `receivedBytes === size` and completes). A re-initiate refreshes the `overwrite` flag. An open session for the same destination+name but a *different* fingerprint is superseded — its bytes belong to a different file.

Errors that share a status code carry a machine-readable `kind` (e.g. the three `409`s) so the frontend never branches on prose — the queue's failure-kind contract. This is an additive field on the existing `{success:false, error}` error envelope.

### D6 — Chunk bounds

Client slices at **8 MiB**; the server accepts at most **32 MiB** per append (`413` above) and refuses any append that would push the staged total past the declared size. Both are module constants, not env vars: they are protocol invariants, and the operational knob that matters (throughput) is the rate-limit allowance in D7. nginx's body limit already exceeds 32 MiB; no deployment change.

### D7 — A dedicated rate-limit allowance for appends

The general limiter gains an optional `skip(req)` predicate; `server.js` mounts it with a predicate matching the chunk route on both prefixes, so appends do not consume the write bucket. The chunk route itself carries a second `createRateLimit({ writePerMinute })` instance (own bucket map — instances never share state), sized by a new `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` (default `600`, `0` disables, validated by the existing `perMinute()` helper) and applied after `authenticate`, before any file work. Arithmetic: 5 GiB / 8 MiB = 640 appends; 600/min ≈ 80 MiB/s sustained — slow links never notice, and a genuinely abusive client still hits a bound. **Alternatives rejected:** *exempting appends entirely* — the api-security contract says every mutating route is limited, and an unlimited authenticated write path is a DoS gift; *raising the global write bucket* — regresses an established bound for every route; *leaving it unchanged* — caps chunked uploads at ~8 MiB/s (60 × 8 MiB/min) and turns large files into 429 storms.

### D8 — Client transport, recovery, and the fingerprint

`uploads.js` gains a transfer loop: initiate → append (XHR per chunk so `xhr.upload` progress and abort stay available; progress within a chunk is shown capped at that chunk's end, and any unacknowledged remainder rolls back on failure) → complete. **Pause** aborts only the in-flight chunk and keeps the session; **resume** continues from the last `receivedBytes`; **retry** does the same; **cancel** `DELETE`s the session. After a reload the queue is gone, but re-selecting the same file re-initiates with the same fingerprint and is adopted mid-transfer — no `localStorage`, no session list endpoint. All URLs and the CSRF header stay in `api.js` (named builders), per the repo boundary.

The fingerprint is the browser's own `(destination, name, size, lastModified)`. Accepted limitation: a different file with all four identical within the TTL window would be appended to. Browser mtimes are millisecond-precision and the window is bounded (D9); content hashing was rejected in Non-Goals. Recorded in ADR-011.

### D9 — Lifecycle: TTL, tombstone, and sweep points

Open sessions expire after **7 days** of inactivity (`updatedAt`); a completed session leaves a **15-minute tombstone** so a lost `complete` response can be retried idempotently, then disappears. Sweeping runs on server start and on initiate — no timer, no tree scan. The boot sweep is non-creating: a host that has never seen a session sweeps nothing rather than materialising the store, which is also what keeps server-booting test suites hermetic without the seam. Deletion order on abort is **staged file first, then record**: a crash between the two leaves a record whose file is missing, which reads as `receivedBytes: 0` and is harmless; the reverse order could orphan a file forever. All constants are module-level.

### D10 — Serialization: one writer per session, in process

Every session mutation takes a per-session promise-chain lock (`Map<id, Promise>`); appends validate `offset === stat(size)` while holding it, and abort waits for an in-flight append before unlinking. This is sound for the deployment contract (one Node process, ADR-008). **Alternatives rejected:** *file locks / advisory locks* — cross-process machinery this deployment has no process pair to need; *relying on write isolation alone* — offset validation and placement ordering are the real invariant, not byte atomicity. Ceiling noted in code (`ponytail:` comment): a second instance would need a shared lock.

### D11 — Reuse over reinvention

`PathService.resolveSecurePath` for every client path, `validateFileName` / `validateClientPath`, `UploadService`'s destination resolution, free-space seam, `commit()`, and `discard()` (with its Windows unlink retry), `AppError`, the envelope rules, and the `router.js`/`api.js` frontend boundaries are all reused as-is. The only shared-file edits are the limiter's new `skip` option, two lines in `server.js` (the limiter mount and the fire-and-forget boot sweep), the `errorHandler`'s additive pass-through of `kind` / `receivedBytes` on the error envelope, and the frontend transport.

## Risks / Trade-offs

- **Rate-limit change weakens a hardened surface** → the allowance is dedicated (not absent), applied post-auth, default small enough to bound abuse; api-security tests pin both the skip predicate and the standing 429 behavior of everything else.
- **Fingerprint collision resumes the wrong content** → accepted and documented (D8); bounded by same-size + ms-mtime + 7-day TTL; revisiting requires an opt-in hash, recorded as the upgrade path.
- **Crash mid-abort leaves a lingering record** → deletion order in D9 makes the residue inert; the next sweep clears it.
- **Disk full during a transfer** → append returns `507` with the session intact and the offset unchanged; freeing space and retrying continues the same session. Initiate keeps the legacy pre-flight gate.
- **Long fast-LAN transfers may throttle at the allowance** → `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` is the calibration knob; the default's arithmetic is documented in D7.
- **Sweep cost grows with open sessions** → one filter pass over a single JSON document at initiate/boot; bounded in practice by TTL and single-operator use.
- **Old frontend against new server (or vice versa) mid-release** → the legacy endpoint is untouched, so an old bundle keeps working; a new bundle fails honestly (retryable error) if the server predates the endpoints — no fabricated fallback per the Files-page honesty rule.

## Migration Plan

1. Ship server first, then the frontend bundle in the same release (single-process deploy, ADR-008): appends are additive, the legacy path is untouched.
2. Optional env `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` documented in `.env.example`; no required env change.
3. Rollback: an older release ignores `upload-sessions.json` (unknown file in `AFM_DATA_DIR`) and its database of sessions expires via the TTL sweep if the newer release ever runs again; staged `.part` files are invisible to listings and removed by abort/TTL.
4. **Archive order:** before `resumable-uploads` is archived, `upload-pipeline-correctness` must be archived — the `upload-queue-integrity` delta modifies the capability that change carries, and the tooling requires the target spec to exist at archive time (validate is intentionally silent about the sister-change case). The spec delta models the retry change as REMOVED + ADDED because scenario titles are matched by name during MODIFIED merging, and the reset-to-zero scenario's title cannot survive honestly.

## Open Questions

None — every choice above is resolved with a stated default; the two tunables (chunk allowance, TTL) have documented constants and an env knob where operational variance exists.
