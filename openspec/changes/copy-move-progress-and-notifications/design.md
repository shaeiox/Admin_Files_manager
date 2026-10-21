# Design

## Context

See `proposal.md` — Why for motivation and `specs/filesystem-operation-status/spec.md`
for the behavioral contract. This document covers only the implementation approach.

The three facts that shape every decision below, all verified against the tree:

1. **The bytes move server-side.** `FileSystemService.copy` (`src/services/FileSystemService.js:272`)
   delegates to `fs.cp({ recursive: true })`; `FileSystemService.move` (`:200`) delegates to
   `fs.rename`. Both run inside the Node process against `STORAGE_ROOT`. The client's request
   body is a few hundred bytes of JSON and the response arrives only after the whole loop in
   `copyItems`/`moveItems` (`src/controllers/fs.controller.js:321,390`) finishes.
2. **`fs.cp` exposes no progress callback.** Node's options are `dereference`,
   `errorOnExist`, `filter`, `force`, `preserveTimestamps`, `recursive`, `verbatimSymlinks`.
   There is nothing to hook. `fs.rename` is a single syscall with no intermediate state.
3. **The repo already owns the pieces this needs.** A generic `.progress` / `.progress-bar` /
   `.is-striped` / `.is-success` / `.is-error` / `.progress-sm` stylesheet already exists globally
   in `public/assets/css/components.css:1151-1186` (not uploads-scoped). `uploads.js` already
   demonstrates honest aggregate accounting in `computeGlobalProgress` (`:153`) — failed items
   contribute to neither side of the fraction and are counted separately — plus dirty-set
   throttling at `PROGRESS_CADENCE_MS` (`:1005`) and an accessible `role="progressbar"` in
   `renderGlobalProgress` (`:1143`). `Toast` (`public/assets/js/app.js:307`) is the live
   notification surface; `AFM.Notifications` (`notifications.js`) is a **historical activity
   feed** refetched from `GET /dashboard/summary`, with no live update and no progress semantics.

The Files page currently has **no progress surface and no notification bell** —
`public/files.html` loads `theme.js, api.js, app.js, sidebar.js, router.js, files.js` and
contains zero `data-tip="Notifications"` elements, so `AFM.Notifications` is not even reachable
from the page where Copy and Move happen.

## Goals / Non-Goals

**Goals:**
- A client can determine, at every moment, an operation's state, its in-flight item, and its real progress.
- No displayed figure is inferred from a timer, an estimate, or a guess about ordering.
- Existing copy/move semantics, error codes, and the partial-failure contract are bit-for-bit unchanged.
- No new dependency, no new transport, no new infrastructure process.

**Non-Goals:**
- Cross-instance operation tracking. The registry is in-process; ADR-008 deploys a single node.
- Progress for Download, Delete, Rename, or Upload — only Copy and Move are in scope.
- Persisting operations to `admin.sqlite`. Nothing survives a restart by design (see Risks).
- Retro-fitting the notification bell onto the Files page as a separate concern.

## Decisions

### 1. Poll a status endpoint; do not add a push transport

**Chosen:** `POST /fs/copy` and `PUT /fs/move` register an operation and return its id at
initiation; the client reads `GET /fs/operations/:id` on an interval.

**Rejected — `xhr.upload.onprogress` on the existing request.** This is the trap. It already
exists (`api.js:336`) and would be the smallest diff, but it measures client-to-server bytes. The
request body is JSON; it saturates instantly and reports nothing about the copy. It would produce
a bar that reads 100% while the work is still running — precisely the fabricated progress the
spec forbids.

**Rejected — SSE (`text/event-stream`).** Live push with no polling delay, but the repository
contains zero SSE or WebSocket infrastructure. It would introduce a new transport class, new
connection lifecycle, new auth handling for long-lived connections, and nginx/proxy
configuration that ADR-008 does not currently account for. Poll-on-interval with a fast path and
backoff delivers acceptable latency for an operation measured in tens of seconds.

**Rejected — WebSocket.** Strictly more machinery than SSE for strictly less fit; nothing in this
app is bidirectional.

**Why polling is adequate:** the existing `Toast` and `AFM.Notifications` surfaces are already
re-fetch-on-demand, and the upload queue already paints on a 250 ms cadence. Polling an in-memory
map is strictly cheaper than either. The status read is a bare object, mounts inside
`src/routes/api.js` after `authenticate` and `csrf`, and therefore inherits session enforcement
and CSRF handling with no new guard code.

### 2. Replace `fs.cp` with an explicit walk to obtain real byte progress

**Chosen:** `FileSystemService.copy` performs its own recursive walk — `lstat` per entry,
`copyFile` per file, `mkdir` per directory — reporting the in-flight name and per-file byte
counts as it goes.

**This is the highest-risk decision in the change** and is taken deliberately, because it is the
only way to satisfy "Copy reports determinate byte progress." It buys nothing for Move, which is
why `move()` takes only a per-item callback.

**The safety constraint that makes it acceptable:** `test/api/fs.symlink.test.js` already pins
refusal on the copy/move write paths — copy through an escaping link copies nothing into the root
(L199), move through one leaves it in place (L205), copying *into* one writes nothing outside
(L212), and a ZIP must not follow a link nested inside a real folder (L164). The walk therefore
must use **`lstat`, never `stat`**, to decide whether an entry is a link — the same rule already
applied at `FileSystemService.js:484`, where a comment records that `stat` would follow an entry
swapped for a link between `readdir` and the check. Any entry whose resolved target leaves the
root is refused, matching current behavior.

**Rejected — keep `fs.cp` and report per-item only.** Zero risk to copy semantics, and the bar
would still advance meaningfully per file. Rejected because the user selected real byte progress,
and because a large single-file copy is exactly the case where a per-item bar freezes for its
entire duration and shows nothing.

**Rejected — stream via a pipe and count bytes.** Would report bytes but not the in-flight
*name*, and would bypass the `copyFile` error semantics that produce today's messages.

### 3. Pre-compute the byte total so the fraction is real, or declare it unavailable

**Chosen:** before the walk begins, `copy` stats the source subtree to sum sizes. The operation
carries `totalBytes` and `bytesAvailable: true`. If that pre-pass fails for any reason, the
operation carries `totalBytes: null` and `bytesAvailable: false` — **not** zero.

**Why this matters:** without a total, a byte fraction is unavailable and the bar would have to be
indeterminate for Copy too, which is the case this decision exists to avoid. The alternative —
accumulating the total as the walk discovers files — would make the denominator grow mid-flight
and the bar jump backwards, which is a fabricated-looking curve. A cost is accepted: the
pre-pass is one `lstat` per source entry before any byte moves. For a very deep tree that is
latency before visible progress begins, which is why the spec requires the `preparing` state to be
distinguishable from `in_progress` (see spec, "Every Operation Reaches A Terminal State" and
"Operation Progress Reports Only Measured Work").

**Rejected — per-item byte progress without a total.** Denominator unknown until the end.

### 4. Move is indeterminate by construction, not by omission

**Chosen:** `move()` invokes its per-item callback immediately before each `fs.rename` and once
after it returns. The operation exposes `itemsDone`/`itemsTotal` and a `determinate: false` flag.
The UI renders a striped `.progress-bar` with no `aria-valuenow`.

**Why:** a percentage over a move would have to be derived from time elapsed, which is an estimate
about I/O the system cannot see. The repo's standing rule is that a count of `0` is a real reading
and an unmeasured quantity must be reported as explicitly unavailable rather than substituted —
the same reasoning that keeps `getHealthMetrics` from shipping a `status` field with no threshold
source, and that keeps `os.loadavg()` out of the dashboard because it returns a fabricated
`[0,0,0]` on Windows. A timed move percentage would be the same fabrication with extra steps.

**Rejected — per-item determinate bar.** The fraction would be real but the bar freezes for the
entire duration of each rename, and for a single-item move it is a 0-or-100 bar — technically
honest, visually useless, and it invites the reader to assume intra-item progress exists.

### 5. Extend `Toast` with an in-place update; do not build a second notification system

**Chosen:** lifecycle notifications (start, partial, total failure, cancellation) go through the
existing `Toast`. Progress goes in a **separate persistent surface in the Files page**, not in a
toast.

**Why not progress in a toast:** `Toast.show` always appends a new node and starts a new
expiry timer, `MAX_VISIBLE` is 4, and the default duration is 3800 ms. There is no update path —
the returned handle is `{ dismiss }` only. Reusing Toast for progress would mean either a new
toast per update (an unbounded toast storm against a 4-toast cap) or growing Toast into a
component it was not designed to be. The minimal, honest change is one additive method to Toast
that mutates an existing node's title/message/type, used for the start → terminal transition of a
single operation.

**Why not `AFM.Notifications`:** it renders `MetadataService.getActivities`, a historical feed
refetched on open. It has no live update, no per-operation key, and no progress semantics; it
cannot represent an in-flight operation at all. It is also not loaded on `files.html`.

**De-duplication:** each operation carries its id in the toast's dataset. Start, terminal, and any
cancel notification are keyed on that id, so exactly one start and exactly one terminal toast can
exist per operation, and a terminal toast replaces its own start toast in place rather than
stacking beside it.

### 6. Guard `pasteItems()` and guarantee a terminal UI state

**Chosen:** `pasteItems()` takes an in-flight guard keyed on the operation id. The Paste control is
disabled for the duration. A `finally` block runs on every exit — resolved, rejected, or thrown —
so the guard clears and the control is restored regardless of outcome.

**Why:** today `pasteItems()` has no guard and no `finally`. Two rapid activations fire two
identical operations; the second hits the `409` name-collision path and surfaces as a spurious
error. The clipboard bookkeeping at the end (`state.clipboardPaths` filtering, `updatePasteButton`)
is also skipped entirely on a throw, leaving the UI inconsistent. Per-operation keys mean
concurrent operations cannot cross-report: progress, filename, and terminal toast all resolve
against the id that produced them.

### 7. Bound the registry and scope reads to the creating session

**Chosen:** an in-process map holding active and recently-terminal operations, evicted to a fixed
cap, with a terminal TTL. Each operation records its owning session id; a status read from a
different session is refused as unknown. Reads of an evicted operation return unknown, not a
status.

**Why:** an unbounded registry in a long-lived Node process is a leak; an in-process registry also
cannot survive a restart, so "unknown" must be a normal, expected answer the client handles — the
client treats an unknown id as "cannot report further" and falls back to its own terminal handling
rather than polling forever.

**Precedent for the bound:** `UploadService` already gates concurrency with a configurable ceiling
(`AFM_UPLOAD_MAX_CONCURRENT`, default 4, `UploadService.js:104`) and refuses past it with a `429`.
The operation registry follows the same shape — a fixed cap, a refusal or eviction at the edge, no
unbounded growth.

**Rate limiting:** `src/middlewares/rateLimit.js` already exports `createRateLimit` and
`perMinute` with `READ_PER_MINUTE`/`WRITE_PER_MINUTE` defaults. Polling must not let a client
amplify request volume; the status route is registered with the existing read limiter rather than
an exemption.

### 8. The progress surface is present only while an operation runs

**Chosen:** the strip is `hidden` until an operation is accepted, and on reaching a
terminal state it is left on screen showing that outcome for `OPERATION_RESULT_TTL_MS`
(5 s) before being removed.

**Why the stylesheet matters, not just the markup.** `.operation-strip` sets
`display: flex`, and an author declaration always beats the UA default
`[hidden] { display: none }`. A surface that only ever toggles the `hidden`
*attribute* therefore stays visible from page load — the exact defect
`files.css` already documents and works around for `#clipboardStrip`,
`#btnPaste` and `#btnCancelCut` at the top of the file. `#operationStrip[hidden]`
joins that rule, and a source-level test pins the membership so a future
restyle cannot silently reintroduce the bug.

**Why the 5 s linger.** The outcome of a long operation is the thing the operator
waited for; removing it the instant it lands discards the only on-screen record of
what happened to each item. It is bounded, not permanent, so the toolbar returns to
its normal state. Starting another operation cancels the pending removal
immediately rather than queueing behind it.

## Risks / Trade-offs

**[Replacing `fs.cp` regresses symlink safety or error semantics]** → The walk uses `lstat` and
never `stat` to classify entries, matching the existing rule at `FileSystemService.js:484`. Every
error path maps to the same `AppError` message and status the current `catch` produces
(`EACCES`/`EPERM` → 403, otherwise → 500). The existing `test/api/fs.symlink.test.js` escaping-link
cases (L199, L205, L212, L164) are run unmodified as the acceptance gate, and
`test/services/FileSystemService.copy.test.js` gains walk-parity cases before the walk replaces
`fs.cp`.

**[The byte-total pre-pass delays first visible progress on deep trees]** → The `preparing` state
is distinct from `in_progress`, so a slow pre-pass is reported as preparation rather than as a
stalled bar. If the pre-pass fails, the operation degrades to `bytesAvailable: false` and the bar
goes indeterminate — never a zero total.

**[An in-process registry loses operations on restart]** → A status read for an unknown id returns
"unknown", and the client treats that as a terminal condition it must resolve rather than a
transient error. Stated as a known limitation, not papered over.

**[Polling multiplies request volume]** → Concurrent operations per session are capped; the
status route uses the existing read rate limiter; polling backs off when the reported state has
not changed and stops unconditionally at a terminal state.

**[A styled surface silently overrides `[hidden]` and never disappears]** → `.operation-strip`
sets `display: flex`, which beats the UA default. `#operationStrip[hidden]` is declared
alongside the existing `#clipboardStrip[hidden]` rule, and a source-level test asserts
both selectors stay in that rule, so a future restyle cannot reintroduce it.

**[A progress surface that survives page swaps leaves stale state]** → Files-page lifecycle rules
already require `destroy()` to remove every listener and timer a page module adds. The poller is
started and stopped from the page module's init/destroy pair like any other timer, and
`router.js` navigation closes shared surfaces the way it already closes `AFM.Notifications`.

**[Copy still cannot report progress *within* one `copyFile`]** → `copyFile` is atomic at the
call granularity; byte counts therefore advance per file, not per chunk. The bar advances in
per-file steps. Documented rather than smoothed over with interpolation.

## Migration Plan

Additive and backward compatible; no data migration and no schema change.

1. Ship the operation service and the status route. Nothing calls them yet.
2. Ship the copy walk behind the existing copy signature, with parity tests green before it
   replaces `fs.cp`.
3. Wire operation registration into `copyItems`/`moveItems`; the response envelope and
   `data.copied` / `data.moved` / `data.failed` shapes stay byte-identical, with the operation id
   added as an additional field (ADR-007 additive-only).
4. Ship the Files-page progress surface and notification lifecycle behind the in-flight guard.
5. Update `docs/CONTRACTS.md` for the new endpoint and the unchanged copy/move envelopes.

**Rollback:** revert steps 4 and 3 independently — the frontend reverts to the pre-existing
`pasteItems`, which still works because the copy/move contract never changed. Steps 1 and 2 are
inert on their own. No persisted state, so there is nothing to unwind.

## Open Questions

- The exact retention cap and terminal TTL for the operation registry, and the exact poll cadence
  and backoff thresholds. These are tuning constants; they do not change the approach, the specs,
  or the task breakdown.