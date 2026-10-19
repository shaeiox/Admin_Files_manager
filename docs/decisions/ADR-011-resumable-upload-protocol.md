# ADR-011 — Resumable Upload Protocol

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** Project maintainer
- **Tags:** api, uploads, storage, protocol
- **Change:** `openspec/changes/resumable-uploads`

## Context

The upload path is a single multipart `POST /api/fs/upload` bounded by `UPLOAD_MAX_BYTES`
(default 5 GiB). A dropped connection, a pause, a page reload or a server restart loses the whole
transfer, and the Upload page says so. The constraints that shaped the solution: the runtime
manifest is pinned to seven packages, the frontend has no build step, every non-GET `/api` request
shares one 60-per-minute per-IP write bucket, and the deployment is one Node process (ADR-008).
Options were evaluated in `openspec/changes/resumable-uploads/design.md` (D1-D4, D10); this ADR
records the chosen protocol, the closed refusal vocabulary, and what was rejected.

## Decision

1. **An application-level chunked session protocol, not a library.** Five additive endpoints under
   `/fs/uploads` — initiate, append, status, complete, abort — served by the one assembly on
   `/api/v1` and `/api`. The legacy multipart endpoint is untouched.
2. **The server is the only authority on progress.** `receivedBytes` is always `stat(staging).size`,
   read fresh; no stored counter, no client-supplied offset. An append whose offset differs from
   the current size stores nothing.
3. **Sessions live in `data/upload-sessions.json`** (`UploadSessionService`, the `SettingsService`
   pattern: `dbPath` + cache seams, atomic writes, serialized writers). Staged bytes live at
   `<destination>/.upload-<32-hex>.part` — same-volume for an atomic `UploadService.commit()`, and
   hidden from `list`/`tree` by the dotfile filters.
4. **Identity is the browser's fingerprint** `(destination, name, size, lastModified)`: re-offering
   the same fields adopts the open session (a completed one answers its full size); a different
   fingerprint for the same target supersedes it — those bytes are a different file.
5. **Chunk bounds are protocol constants:** the client slices at 8 MiB, the server accepts ≤ 32 MiB
   per append and refuses any append past the declared size. A failed write rolls the staged file
   back to the acknowledged offset, so the session stays resumable.
6. **Lifecycle:** 7-day inactivity TTL on `updatedAt` (appends renew it, reads do not); a 15-minute
   completion tombstone makes repeated completion idempotent; sweeps run at boot (non-creating) and
   on initiate; abort deletes the staged file before the record.
7. **Serialization is per-session, in process:** a promise-chain lock per session id. Sound because
   the deployment is one Node process; a second instance would need a shared lock (the `ponytail:`
   ceiling named in the service).
8. **A dedicated rate allowance.** The general limiter gains `skip(req)` and skips the chunk route;
   the route carries its own `createRateLimit` instance sized by `AFM_RATE_LIMIT_CHUNK_PER_MINUTE`
   (default 600, `0` disables), applied after `authenticate`. Arithmetic: 5 GiB / 8 MiB = 640
   appends; 600/min keeps large transfers from becoming 429 storms while a genuinely abusive
   client still hits a bound.
9. **Refusals carry a closed `kind` vocabulary** (additive on the error envelope):
   `session_expired` (404); `offset_mismatch`, `session_incomplete`, `destination_conflict`,
   `session_completed` (409); `chunk_too_large`, `size_exceeded` (413). `offset_mismatch` and
   `session_incomplete` also carry `receivedBytes`. The only producer in `src/` is
   `UploadSessionService`; the vocabulary is pinned by `test/api/versioning.contract.test.js` and
   covered per outcome by `test/api/upload-sessions.contract.test.js`.

## Consequences

- An interrupted transfer resumes after network failure, pause, reload or server restart, and the
  progress shown is always bytes the server acknowledged. Nothing partial is ever visible: no
  staging file appears in `list`/`tree`, and a `200` from `complete` names the path actually
  written.
- An old frontend bundle keeps working (the legacy endpoint is untouched); a new bundle against an
  old server fails honestly per item — no fabricated fallback.
- Session uploads record **no metadata activity** (downloads/stars/activity are not transfer
  state); deliberate while the feature ships.
- Rollback: an older release ignores `upload-sessions.json` (an unknown file under `AFM_DATA_DIR`);
  staged `.part` files are invisible and swept by the TTL once a newer release runs again.
- `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` is the operational calibration knob; the 8 MiB / 32 MiB / 7-day
  / 15-minute constants are protocol, not configuration.

## Rejected alternatives (recorded)

- **tus.io**: an eighth runtime dependency, and its auth/PATCH/MD5 extension model would have to be
  reconciled with the cookie + CSRF + `authenticate` stack — for a five-endpoint surface.
- **Raw `Content-Range` PUTs**: no place to carry governance (TTL, declared size, overwrite
  authorization, hidden staging) without inventing the session object anyway.
- **A per-chunk bitmap or journal**: write amplification for no benefit when appends are sequential
  and validated against `stat` anyway.
- **Client-trusted offsets**: a bug or a hostile client could gap or overlap the file.
- **`admin.sqlite`**: migrations and a schema shared with the File Portal contract (ADR-010) for
  data the portal must never see.
- **`metadata.json`**: fire-and-forget by design; owns downloads/stars/activity, not transfer state.
- **Sidecar marker files**: per-file clutter in operator-visible trees, no index to sweep.
- **A central staging directory**: `EXDEV` on commit, free space measured on the wrong volume, and
  a second placement path to audit.
- **File / advisory locks**: cross-process machinery a one-process deployment has no pair to need.
- **Raising the global write bucket, or exempting appends outright**: the first regresses an
  established bound for every route, the second gifts an unlimited authenticated write path.

## Not decided here (ceilings)

- **Fingerprint collision** resumes the wrong content only when a different file matches all four
  fields inside the TTL window; bounded, accepted, and the upgrade path is an opt-in content hash.
- **Parallel chunks for one session, multi-instance coordination, and a session-listing UI** are
  out of scope; recovery works by re-selecting the file.
- **Archive order** (tooling, not runtime): `upload-pipeline-correctness` must be archived before
  `resumable-uploads` — the `upload-queue-integrity` delta needs its target spec to exist.
