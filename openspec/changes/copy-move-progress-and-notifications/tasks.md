# Tasks

## 1. Operation Registry And Lifecycle

- [x] 1.1 Create `src/services/OperationService.js` with a create/read/advance/finish API and a per-operation record (id, kind, owning session id, state, item in flight, items done/total, bytes transferred/total, `bytesAvailable`, per-item failures) — verify with a unit test asserting a new operation starts in `preparing` with `bytesAvailable` unset rather than zeroed
- [x] 1.2 Implement the state machine so an operation moves only through legal transitions and reaches exactly one terminal state (`completed`, `partial`, `failed`, `cancelled`), and a terminal state is immutable — verify with tests asserting an illegal transition is refused and that re-reading a terminal operation returns the same state
- [x] 1.3 Implement progress accounting where a failed item contributes to neither the completed count nor the total used for any fraction, and its count is reported separately — verify with a test asserting a half-failed operation's fraction counts only successful items and that a separate failed count is reported
- [x] 1.4 Implement unmeasured-quantity handling so an undetermined byte total is reported as unavailable with `bytesAvailable: false` and never as `0` — verify with a test asserting the unavailable case renders no byte fraction
- [x] 1.5 Implement eviction to a fixed retention cap plus a terminal TTL, and make an evicted operation read as unknown rather than as a status — verify with a test that pushes past the cap and asserts the oldest operation reads unknown while the registry size stays within the bound
- [x] 1.6 Implement session ownership so a status read for an operation created by another session is refused — verify with a test asserting a second session's read is refused and discloses nothing
- [x] 1.7 Add `test/services/OperationService.test.js` covering all of the above and verify the file passes under `npm test`

## 2. Real Copy Progress

- [x] 2.1 Add a byte-total pre-pass to `FileSystemService.copy` that walks the source with `lstat` and sums sizes before any byte is written, returning a not-available result on failure instead of a zero total — verify with tests covering a correct total, a nested tree, and a failing pre-pass degrading to unavailable
- [x] 2.2 Replace `fs.cp` with an explicit recursive walk (`lstat` per entry, `mkdir` per directory, `copyFile` per file) that reports the in-flight file name and per-file byte counts, preserving the existing `EACCES`/`EPERM` → 403 and other → 500 `AppError` mapping — verify with tests asserting identical error codes and messages for permission and generic disk failures
- [x] 2.3 Enforce the link rule in the walk: classify entries with `lstat` and never `stat`, and refuse any entry whose target leaves the storage root — verify by running `test/api/fs.symlink.test.js` unmodified and confirming the escaping-link copy, move, and copy-into-link cases still pass
- [x] 2.4 Add walk-parity tests to `test/services/FileSystemService.copy.test.js` covering single file, nested tree, empty folder, and the copy-into-itself refusal — verify the file passes under `npm test`
- [x] 2.5 Confirm the walk does not change observable copy results: verify `test/api/fs.contract.test.js` copy cases pass unchanged and that a copied tree is byte-identical to a `fs.cp`-produced tree for the same fixture

## 3. Move Progress Is Per-Item Only

- [x] 3.1 Extend `FileSystemService.move` with a per-item callback invoked immediately before each `fs.rename` and once after it returns, and expose `determinate: false` for moves — verify with a test asserting the in-flight item is one of the submitted paths and that no percentage field is offered for a move
- [x] 3.2 Verify no move regression: run `test/services/FileSystemService.move.test.js` and the move cases in `test/api/fs.contract.test.js` and confirm they pass unchanged

## 4. Backend Operation Wiring And Status Endpoint

- [x] 4.1 Register an operation in `copyItems` and `moveItems`, driving its state through the lifecycle and preserving the existing envelope — verify with a test asserting `success`, `data.copied`/`data.moved`, and `data.failed` are byte-identical to the pre-change response while an operation id is added as an additional field
- [x] 4.2 Preserve per-item failure detail into the terminal state, including the total-failure case where the first failure reason is what the request surfaces — verify with tests asserting distinct reasons survive per item and that a total failure still reports the first reason
- [x] 4.3 Add `src/controllers/operations.controller.js` and `src/routes/operations.routes.js`, and mount the router inside `src/routes/api.js` after `authenticate` and `csrf` so it inherits session enforcement — verify with a test asserting an unauthenticated status read is refused
- [x] 4.4 Register the status route with the existing `createRateLimit` read limiter — verify with a test asserting repeated status reads are throttled
- [x] 4.5 Document the status endpoint and the unchanged copy/move envelopes in `docs/CONTRACTS.md`, and note the progress fields' availability semantics — verify the documented request and response match the implemented handler
- [x] 4.6 Verify `GET /api/v1/health` still reports `apiVersion: 1` and that the `/api` alias serves the new route identically, since the assembly is mounted once for both prefixes — verify with a test asserting both prefixes return the same status payload

## 5. Frontend Notification And Progress Primitives

- [x] 5.1 Add an in-place update method to `Toast` that mutates an existing toast's title, message, and type and returns the handle, without changing the append-and-expire behavior every existing caller depends on — verify with a test in `test/frontend/app.test.js` that a toast can be updated and that no second node is created
- [x] 5.2 Add the operation status accessor to `public/assets/js/api.js` through `window.API`, with no `/api` literal or base-URL construction outside `api.js` — verify with the existing `test/frontend/api-boundary.test.js` passing
- [x] 5.3 Add the progress container markup to `public/files.html`, reusing the global `.progress` / `.progress-bar` classes, with `role="progressbar"` and correct ARIA attributes — verify with a source-level assertion in `test/frontend/files.test.js` that the markup is present and the aria wiring is correct

## 6. Files Page Lifecycle

- [x] 6.1 Rewrite `pasteItems` to register an operation, emit a start notification keyed on the operation id immediately after initiation returns, and start the poller — verify with a test asserting a copy start and a move start each produce exactly one start notification naming the operation
- [x] 6.2 Add an in-flight guard keyed on the operation id and disable the Paste control for the duration, with the guard cleared in a `finally` so every exit path restores the UI — verify with tests asserting a second activation during flight does not fire a second request and that the control is restored after success, after rejection, and after a thrown request
- [x] 6.3 Render the in-flight filename, items done against total, and — for copies with an available byte total — bytes transferred against total; render Move with a striped bar and no `aria-valuenow` — verify with tests asserting each field's rendered value and that a Move carries no determinate percentage
- [x] 6.4 Render the unavailable case explicitly when the byte total is not available rather than showing a zero total — verify with a test asserting the unavailable marker is shown and no `0 B / 0 B` appears
- [x] 6.5 Emit exactly one terminal notification per operation: success on `completed`, a warning carrying successes and failures on `partial`, an error on `failed`, and a cancellation notice on `cancelled` — verify with tests for each terminal state
- [x] 6.6 Prevent duplicate notifications: key start and terminal notifications on the operation id so a terminal notification replaces its own start toast in place and no operation yields two terminal notifications — verify with a test that polls past a terminal state and asserts the toast count does not grow
- [x] 6.7 Stop the poller unconditionally on a terminal state and on an unknown operation id, and resolve the UI rather than leaving it loading — verify with tests for both the terminal-state stop and the unknown-id stop
- [x] 6.8 Keep concurrent operations independent: progress, filename, and notifications resolve against the originating operation id — verify with a test running two operations and asserting neither reports the other's filename or outcome
- [x] 6.9 Throttle rendering with a dirty-set cadence so progress updates do not cause excessive re-render, following the existing `PROGRESS_CADENCE_MS` pattern — verify with a test asserting a burst of updates produces a bounded number of paints
- [x] 6.10 Back off polling when the reported state has not changed, and stop on terminal — verify with a test asserting the poll interval lengthens across unchanged reads
- [x] 6.11 Stop the poller and clear the in-flight guard in the page module's `destroy()` so a page swap leaves no timer or listener behind — verify with a test that destroys and re-inits the page and asserts no polling continues

## 7. Regression And Documentation

- [x] 7.1 Run the full suite with `npm test` and confirm every pre-existing test still passes with no test weakened, skipped, or its expectations relaxed — verify by the suite exiting 0
- [x] 7.2 Verify the clipboard semantics are unchanged: a copy does not consume the clipboard, a failed move stays pending for retry, and only moved items come off the clipboard — verify with the existing clipboard cases in `test/frontend/files.test.js` passing unmodified
- [x] 7.3 Update `docs/REPO_MAP.md` with the new service, controller, and route files — verify each documented path exists on disk
- [x] 7.4 Verify the change against the repo guardrails: no filesystem call bypasses a service, all filesystem-derived strings reaching markup go through `escapeHtml`, no `/api` literal outside `api.js`, and no `window.open` in the download path — verify `test/integration/repo-guardrails.test.js` and `test/integration/escaping.test.js` pass
- [x] 7.5 Confirm the copy walk's refactored implementation cannot expose a filesystem-derived string into markup unescaped and that the in-flight filename is escaped at render time — verify with a test rendering a filename containing HTML metacharacters

## 8. Progress Surface Visibility

The progress strip sets `display: flex`, which an author stylesheet always wins over the
UA default `[hidden] { display: none }` — so it rendered visible from page load and
toggling the attribute could never hide it.

- [x] 8.1 Add `#operationStrip[hidden] { display: none; }` to the existing `[hidden]` rule in `public/assets/css/files.css`, and verify by test that the strip is not rendered before any operation starts
- [x] 8.2 Pin the fix with a source-level test asserting `#operationStrip[hidden]` is declared with `display: none` in the same rule as `#clipboardStrip[hidden]` — verify with a test in `test/frontend/files.operations.test.js` that fails when the selector is absent
- [x] 8.3 Replace the immediate strip removal on completion with a bounded linger: the outcome stays visible and is removed after the result TTL, and the elapsed period is bounded rather than open-ended — verify with a test asserting the strip is still shown just after completion and hidden once the TTL elapses
- [x] 8.4 Cancel the pending removal when another operation starts, so a new operation never queues behind an old one's linger — verify with a test asserting the strip is still visible and no removal is pending after starting a second operation
- [x] 8.5 Clear the pending removal in `destroy()` so a page swap cannot leave a timer that hides the strip on the next page — verify with a test that destroys mid-linger and asserts no removal timer survives
- [x] 8.6 Verify the pre-existing clipboard strip is unaffected — verify with the existing `#btnPaste[hidden]` rule test in `test/frontend/files.test.js` passing unmodified

## 9. Pending-Clipboard Disclosure

The clipboard strip said "N items ready to move" but never *which* files. It now discloses
them on hover or activation, reusing the shared `.dropdown-menu` styling and close behaviour
(outside click, Escape) rather than a bespoke panel.

- [x] 9.1 Add a trigger (the strip's sentence) and a `#clipboardItemsDropdown` menu inside the strip in `public/files.html`, reusing the shared `.dropdown-menu` mechanics (outside click and Escape via `Dropdown` in `app.js`) while owning the trigger toggle so `aria-expanded` stays truthful. The trigger is a real `<button>` — the page bans role-as-button spans, and a native button makes Enter/Space activation free — verified by a test asserting the trigger's `aria-controls` names the menu id, the markup ships `aria-expanded="false"`, and no `role="button"` exists
- [x] 9.2 Populate the menu from the clipboard snapshot (`state.clipboardItems`) in `updatePasteButton`, clearing it when nothing is pending — verified by tests that cutting two items lists both names with their source paths, that a copy says "copy", and that cancelling or completing a move empties the menu
- [x] 9.3 Escape every filesystem-derived string (names, paths) before it reaches the menu markup — verified by a test placing a hostile filename on the clipboard and asserting it renders as escaped text, not markup
- [x] 9.4 Open on hover over the strip and close on leave; click/focus activation toggles it and `aria-expanded` follows, including the paths the shared `Dropdown` closes on its own (outside click, Escape) — verified by tests dispatching `mouseenter`/`mouseleave`, a trigger click, and a document `keydown` Escape
- [x] 9.5 Keep the menu a bounded disclosure: `position: relative` on the strip (the shared `.dropdown-menu` is absolutely positioned), left-aligned below the strip, and a scrollable max-height so a long selection cannot run off the page — verified by a source-level test on the CSS

## Workflow follow-up

- Archive the change after review requirements are satisfied.
- Verify the archived result.