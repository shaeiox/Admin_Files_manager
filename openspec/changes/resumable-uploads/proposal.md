# Proposal

## Why

An upload interrupted by a dropped connection, a closed browser, a server restart, or an operator pausing the queue currently loses every transferred byte — the operator must start again from zero, even for files up to the 5 GiB ceiling. The Upload page can only promise "restarts from the beginning when resumed" because the server has no way to hold a partial transfer and hand it back.

## What Changes

- **A chunked upload-session protocol**, additive under `/api/v1/fs/uploads`: initiate a session (idempotent per file identity), append chunks, read session status, complete, and abort. The resume offset is the size of the bytes the server already holds — a client's claim about its own progress is never trusted.
- **Durable, bounded session state.** Open sessions live in a new JSON store under `AFM_DATA_DIR`, and staged bytes reuse the existing hidden `.upload-<hex>.part` convention inside the destination directory — so a resume survives a server restart. Abandoned sessions expire (default seven days) and are swept on server start and on session creation; nothing partial is ever presented as a file.
- **The Upload page resumes instead of restarting.** Pause keeps acknowledged progress, retry continues from the server-reported offset, and re-selecting an interrupted file (same destination, name, size, and last-modified) continues it after a reload. Copy and tests that pin "restarts from the beginning" are updated together with the transport.
- **The legacy single-request `POST /fs/upload` contract is unchanged**; the new surface is purely additive within v1.
- **Chunk appends get their own rate-limit allowance** (default 600/min, env-tunable like the existing limits) so a chunked transfer is not throttled by the 60-write/min bucket that governs every other mutation. The general write allowance stays exactly as it is for every other route.

## Capabilities

### New Capabilities

- `upload-resumption`: the resumable-upload session protocol and its observable contracts — resume identity, server-authoritative offsets, bounded sequential chunks, atomic and idempotent completion, abandonment and expiry, governance and authentication parity, and the dedicated chunk rate-limit allowance.

### Modified Capabilities

- `upload-queue-integrity`: the queue lifecycle's pause/resume scenario and the retry requirement change — progress no longer resets; resuming and retrying continue from the last byte the server acknowledged, and cancellation discards the server-side session.

## Impact

- **Server**: new `UploadSessionService` and session store; five handlers under `src/routes/fs.routes.js` / `src/controllers/fs.controller.js`; a route-scoped allowance in `src/middlewares/rateLimit.js` + `server.js`; reuse of the existing `UploadService` staging/commit seams, `PathService`, free-space gate, and governance rules.
- **Frontend**: queue transport in `public/assets/js/uploads.js` (pause/retry/cancel/reload recovery), session builders in `public/assets/js/api.js` (all URL construction stays there), copy pinned by `test/frontend/uploads.test.js`.
- **Docs and tests**: new store row in `docs/DATABASE.md`, endpoint contracts in `docs/CONTRACTS.md`, map updates in `docs/REPO_MAP.md`, decision record `docs/decisions/ADR-011-resumable-upload-protocol.md`, live-server contract tests.
- **Compatibility**: additive within `/api/v1` per ADR-007; no new runtime dependency (the pinned seven stay); no nginx change (chunk bodies sit far below `client_max_body_size`).
- **Archive order**: the `upload-queue-integrity` delta modifies a capability carried by the still-in-flight `upload-pipeline-correctness` change. That change must be archived first — the tooling requires a MODIFIED target spec to exist at archive time, and is silent about the sister-change case at validate time.
