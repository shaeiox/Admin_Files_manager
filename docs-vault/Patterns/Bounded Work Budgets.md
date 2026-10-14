---
title: Bounded Work Budgets
type: pattern
language:
  - javascript
status: generated
complexity: medium
dependencies:
  - "[[Storage Services]]"
  - "[[HTTP API Layer]]"
  - "[[Auth and Access Control]]"
  - "[[Feature Pages]]"
related-notes:
  - "[[Explicit Unavailability]]"
  - "[[Concurrency and Consistency]]"
  - "[[Limitations]]"
canonical-source: src/services/FileSystemService.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - pattern
---

# Bounded Work Budgets

## What it is

Every operation whose cost grows with operator data or with client behaviour has an explicit cap. The cap can be an entry count, a wall-clock deadline, a concurrency ceiling, a depth limit, a batch size, or a request rate. When a cap is hit, the operation stops cleanly and **says so**, through `truncated: true`, `childrenLoaded: false`, a 429, or a 400. It never returns a silently partial answer as if it were complete.

## Why this codebase uses it

- AGENTS.md rule 4: async I/O only, *"Never block the event loop"*. An unbounded recursive walk of an operator-populated root would do exactly that.
- ADR-002: the tree walk is *"iterative with an explicit stack — no recursion"*. An exhausted traversal budget is reported as `truncated: true` and removes only that contribution, because *"a truncated total is a WRONG total"* (`getTreeStats` doc comment).
- ADR-009 / AGENTS.md: authentication adds per-IP rate limiting and login lockout.
- Specific cap values (100k entries, 2000 ms, 16, 500, 4) are recorded in code comments. Their rationale is otherwise not documented.

## Where it appears

| Module | Budget | File |
|---|---|---|
| [[Storage Services]] | `getTreeStats`: 100,000 entries / 2000 ms, deadline checked every 512 entries; explicit stack + `break walk`; `truncated` flag | `src/services/FileSystemService.js` |
| [[Storage Services]] | In-process upload gate, default 4 (`AFM_UPLOAD_MAX_CONCURRENT`), 429 when full; free-space watermark (507) | `src/services/UploadService.js` |
| [[HTTP API Layer]] | `mapWithConcurrency(..., 16)` for list enrichment | `src/controllers/fs.controller.js`, `src/utils/concurrency.js` |
| [[HTTP API Layer]] | `getTree` walks two levels; deeper nodes return `childrenLoaded: false` | `src/controllers/fs.controller.js` |
| [[HTTP API Layer]] | Bulk move/copy/delete capped at 500 paths | `src/controllers/fs.controller.js` |
| [[Auth and Access Control]] | Fixed-window per-IP limiter (write 60/min, read 600/min, login 10/min); lockout after 10 failures for 15 min | `src/middlewares/rateLimit.js`, `src/services/SessionService.js` |
| [[Feature Pages]] | Upload concurrency control; Dashboard health poll stops on first failure | `public/assets/js/uploads.js`, `public/assets/js/dashboard.js` |

## Code excerpt

> [!example] `src/services/FileSystemService.js` `getTreeStats`: two budgets, labelled break, reported truncation
> ```js
> walk:
> while (stack.length > 0) {
>     if (budgetExhausted()) { result.truncated = true; break; }
>     // ... readdir; an unreadable directory is recorded in result.errors and skipped
>     for (const dirent of dirents) {
>         if (result.entriesScanned >= maxEntries) { result.truncated = true; break walk; }
>         if (result.entriesScanned % TIME_CHECK_INTERVAL === 0 && Date.now() >= deadline) {
>             result.truncated = true;
>             break walk;
>         }
> ```

> [!example] `src/services/UploadService.js`: the slot is always returned
> ```js
> if (max > 0 && inFlightUploads >= max) {
>     return next(new AppError('Too many uploads in progress. Try again shortly.', 429));
> }
> // released once on res 'close' or 'finish'
> ```

## Pitfalls and known violations

> [!warning] A bounded walk multiplied per row is not bounded per request
> `getList` runs a `getTreeStats` walk for **every** folder in the directory, 16 at a time, and paginates only afterwards. A 20-row page in a directory of hundreds of large folders pays for every walk on every request, search keystrokes included (HTTP API Layer, "getList recursively walks every listed folder before paginating", medium). The fix is to compute sizes only for `sort=size` or for the sliced page, and return `sizeAvailable: false` otherwise.

> [!warning] Unbounded growth outside the request path
> - Expired sessions and audit logs are never purged. `AuditLogRepository.prune` exists but has no caller (Auth and Access Control, low).
> - The metadata download map grows without bound and is rewritten whole on every write (Metadata and Settings Stores, low).

- **Per-process only.** The upload gate and the rate limiter are in-memory. A second process doubles them, and the limiter is a fixed window that allows 2x the rate across a boundary (both marked `ponytail:` in code).
- **The lockout is itself a DoS lever.** Once a lock expires, `failed_login_count` stays at 10 or more, so one wrong password re-locks the account. Anyone who knows the username can keep it locked (Auth and Access Control, "Lockout re-arms on every failure after it expires", medium).
- **Self-terminating polls need a liveness guard.** The Dashboard health poll can start after `destroy()` and then never trip its own stop condition (Feature Pages, medium). See [[Re-entrant Page Lifecycle]].
- **The free-space watermark is coarse.** It checks only the staging volume, not the file size (Storage Services, low).

## How to apply it in new code

1. Anything that walks the tree, fans out per item, or accepts an array gets a cap. Name it as a module constant with an option override (`options.maxEntries ?? DEFAULT_MAX_ENTRIES`).
2. Iterate with an explicit stack, not recursion. Check a count budget every step and a time budget every N steps.
3. Surface the cut-off in the payload (`truncated`, `childrenLoaded: false`, `sizeAvailable: false`) and follow [[Explicit Unavailability]] for the affected numbers.
4. Reject over-cap input with an `AppError` (400/429/507). Do not silently clip it.
5. Release counters on both `close` and `finish`, and guard against a double release.
6. Do bounded work only for the rows you return. Paginate before you enrich.
