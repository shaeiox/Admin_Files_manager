# Proposal

## Why

Copy and Move on the Files page report nothing while they run. `pasteItems()` in
`public/assets/js/files.js` issues a single `await` against `POST /api/fs/copy` or
`PUT /api/fs/move` and emits its first user-visible event only after the response
arrives, so a two-second copy and a five-minute folder copy look identical: no
notification, no progress, no filename, no in-flight state.

The absence is structural, not cosmetic. The bytes move **server-side** —
`FileSystemService.copy` delegates to `fs.cp` and `FileSystemService.move` to
`fs.rename` — so the client sends a few hundred bytes of JSON and receives the whole
result at the end. The only progress transport in the codebase is
`xhr.upload.onprogress` (`public/assets/js/api.js`), which measures client-to-server
bytes and would report a meaningless, instantly-saturated value here. There is no
server-to-client channel, no operation identity, and no in-flight guard on `pasteItems`,
so a long operation is indistinguishable from an idle page, and a double-triggered paste
produces two racing requests whose results interleave.

## What Changes

- Introduce a server-side operation registry and lifecycle for bulk Copy and Move, so an
  operation has an identity, a monotonic state, real progress, and a terminal outcome.
- Add an operation-initiation path that returns an operation id immediately, and a
  read-only status endpoint that reports that operation's current state.
- Report real progress for Copy: replace `fs.cp`'s opaque recursive copy with an explicit
  walk that accounts bytes and names the file in flight.
- Report honest progress for Move: `fs.rename` is a single atomic syscall with no
  intermediate state, so Move reports per-item progress and an indeterminate bar rather
  than a fabricated percentage.
- Add a progress surface to the Files page driven by that status, showing the current
  filename, files completed against total, and bytes where they are genuinely known.
- Complete the Copy/Move notification lifecycle — start, partial success, total failure,
  and cancellation — through the existing `Toast` system, with per-operation
  de-duplication so concurrent operations cannot cross-report.
- Guard `pasteItems()` against concurrent invocation and guarantee a terminal UI state
  on every exit path, including thrown requests and transport failures.

No breaking change. `POST /api/fs/copy` and `PUT /api/fs/move` keep their existing
response envelope and their partial-failure contract; the operation status endpoint is
additive within v1 (ADR-007).

## Capabilities

### New Capabilities
- `filesystem-operation-status`: The lifecycle, identity, progress reporting, terminal
  outcomes, and observability of long-running filesystem operations — specifically bulk
  Copy and Move — including which progress is real, which is indeterminate, and what a
  client may conclude from a given state.

### Modified Capabilities
<!-- None. Existing filesystem-security and storage-semantics requirements are
     unchanged: this change must preserve them, not alter them. The walk replacing
     fs.cp is constrained BY filesystem-security (path containment, symlink refusal),
     which is why that capability is referenced in design.md but is not modified here. -->

## Impact

**Backend (new)**
- `src/services/OperationService.js` — new: operation registry, state machine, progress
  accounting, retention/eviction of terminal operations.
- `src/routes/operations.routes.js` — new: read-only operation status router, mounted
  inside `src/routes/api.js` (which `server.js` mounts once as
  `app.use(['/api/v1','/api'], apiRoutes)` **before** the `/api` catch-all).
- `src/controllers/operations.controller.js` — new: status read + formatting.

**Backend (modified)**
- `src/services/FileSystemService.js` — `copy()` replaces `fs.cp` with an explicit
  recursive walk that reports per-file byte progress; `move()` accepts a progress
  callback. Validation, error codes, and messages are unchanged.
- `src/controllers/fs.controller.js` — `copyItems`/`moveItems` register an operation,
  drive it, and resolve with the existing envelope; per-item errors are preserved
  verbatim in the terminal state.
- `src/routes/fs.routes.js` — unchanged routes; initiation response gains an operation
  reference.

**Frontend**
- `public/assets/js/files.js` — in-flight guard, progress surface, notification
  lifecycle, polling with terminal-state guarantee.
- `public/assets/js/api.js` — operation status accessor; no change to the existing
  `fetch` request path.
- `public/assets/js/app.js` — `Toast` gains an in-place update path (it currently only
  appends and expires; a progress surface cannot be a toast).
- `public/files.html` — progress container markup, reusing the global `.progress` /
  `.progress-bar` classes already defined in `public/assets/css/components.css`.

**Tests**
- `test/services/FileSystemService.copy.test.js` — walk parity and byte accounting.
- `test/api/operations.contract.test.js` (new) — status endpoint contract.
- `test/api/fs.contract.test.js` — copy/move envelope preserved under the new initiation.
- `test/api/fs.symlink.test.js` — the escaping-link write-path refusals must still hold
  under the hand-rolled walk.
- `test/frontend/files.test.js` — start/progress/terminal notifications, concurrency,
  de-duplication.

**Dependencies and infrastructure**
- None added. No SSE, no WebSocket, no polling library; polling reuses `window.API` and
  the existing session/CSRF handling. The operation registry is in-process and
  single-node, consistent with the deployment model in ADR-008.