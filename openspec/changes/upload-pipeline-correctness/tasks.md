# Tasks

Phases are ordered by real dependency. Every task states its verification inline.

**Parallelisation rules.** Two tasks may run concurrently only if they write disjoint file sets. Derived constraints:

- `public/assets/js/uploads.js` — written by phases 1, 3, 4, 5, 6, 7. **Strictly sequential.**
- `public/uploads.html` — phases 5, 6, 7. **Sequential**, same file.
- `test/frontend/uploads.test.js` — phases 1, 3, 4, 5, 6, 7 all append to it. **Sequential**, same file.
- `package.json` — phase 0 only. Single writer, and shared with `files-page-correctness`.
- `server.js` — phase 0 only. Single writer, and shared with two other in-flight changes.
- `src/config/env.js`, `src/middlewares/errorHandler.js` — **not written by this change** (phase 2 pins and verifies only; see `design.md` D9).
- `public/assets/js/api.js` — phase 2 only.
- `public/assets/css/uploads.css` — phase 7 only.
- `public/assets/css/components.css` — phase 7 only.
- `docs/*`, `AGENTS.md` — phase 8 only.

**Contract gate.** Phase 0 is a hard gate. No phase may begin on an unverified assumption about where uploads land.

**Deviation from a naive ordering, stated explicitly.** Escaping (phase 1) is placed *before* the queue refactor (phase 3) even though both touch `uploads.js`. Escaping is a one-line-per-site change against current code, is independently shippable, and closes a live vulnerability; deferring it behind a large refactor would leave that vulnerability open for the duration of the refactor.

---

## 0. Gate — verify the server contract, and record shared-file ownership

- [x] 0.1 **Gate.** Verify the upload *placement* contract is implemented: an upload with `destination=/target` places the file in `/target` **on disk** (assert by inspecting the filesystem, never by reading the response body), and the response `data.path` equals the path the file was actually written to. Reproduce the probe against a live server with a temporary `STORAGE_ROOT`. *Owned by `files-page-correctness` (`upload-destination-integrity`) — see design.md D1. This task **verifies**, it does not implement.*
- [x] 0.2 **Escalation, not absorption.** If 0.1 fails: stop. Record the failing verdict in this change, and re-plan the server-side upload placement as its own change rather than expanding this one. Do not edit `fs.controller.js:327-391` or `src/routes/fs.routes.js` — both are owned by `files-page-correctness`. *design.md D1, R1.*
- [x] 0.3 Verify the overwrite, `preservePath`, and size-limit behaviours report a machine-readable failure kind and a specific status for each class (name rejection, collision, size, missing destination). Record which are present and which are not; phase 2 degrades honestly against whatever exists. *`upload-error-disclosure`.*
- [x] 0.4 Record the CORS and CSP dependency: `server.js:16-19` is escalated by `files-page-correctness`, whose *Untouched* list also names `errorHandler.js` and `env.js`. Confirm neither is claimed before phase 2 edits them. *design.md R1, D9.*
- [x] 0.5 Scope the test script in `package.json` to the test directory so a scratch file elsewhere cannot fail the run (`node --test test/`). Verify the full suite still reports the same test count and exits `0`. **Single writer — coordinate with `files-page-correctness`, which has also claimed this line.** *`upload-regression-coverage` — "The suite cannot be broken from outside the test directory"; design.md D12.*
- [x] 0.6 Remove the duplicated `/api` catch-all in `server.js:41-48` and the duplicated comment above it; verify `GET /api/dashboard/does-not-exist` and `GET /api/fs/does-not-exist` both still return the 404 envelope. **Single writer — coordinate with both in-flight changes.** *proposal.md Impact.*
- [x] 0.7 Establish the frontend test harness in `test/frontend/uploads.test.js`: stub `globalThis.window`, `globalThis.document`, and `globalThis.XMLHttpRequest`, then `require()` `public/assets/js/uploads.js`, mirroring `test/frontend/app.test.js:18-31`. Verify the module evaluates and `window.Uploads` is defined. No new dependency; no DOM harness. *`upload-regression-coverage` — "The suite runs without a browser or a DOM library"; design.md D11.*

*Phases 3–7 are blocked on 0.1–0.3. Phase 1 is blocked only on 0.5 and 0.7.*

---

## 1. Escaping — close the reflected DOM XSS

*Reproduced defect: `uploads.js:511` and `:485` interpolate `item.name` and `item.error` into `innerHTML` unescaped. `escapeHtml` is exported at `app.js:1049` and used zero times in `uploads.js`.*

- [x] 1.1 Add a failing test rendering a queue row for a file named with markup-significant characters, asserting the output contains no injected element and no raw markup sequence from the name. `renderItemHTML` (`:506-522`) returns a string, so this needs no DOM stub. Verify the test **fails** against current code. *`upload-markup-escaping` — "A name containing markup characters renders as text".*
- [x] 1.2 Add a failing test rendering a failed item whose server reason contains markup-significant characters. Verify it **fails** against current code. *`upload-markup-esclosing` → `upload-markup-escaping`, "A server string containing markup is inert".*
- [x] 1.3 Route every interpolation in `renderItemHTML` through `window.AFM.escapeHtml`: the file name (`:511`), the failure reason (`:485`), and any other dynamic value in the returned template. Verify 1.1 and 1.2 turn green.
- [x] 1.4 Route the destination string through `escapeHtml` at both render sites: `initDestination`'s update (`:770`) and `init`'s initial paint (`:811`). Verify with a destination containing a quote and a tag delimiter. *`upload-destination-selection` — "The displayed destination is escaped".*
- [x] 1.5 Confirm no page-local escaping helper was introduced; the shared `escapeHtml` is the only mechanism. Grep `uploads.js` for `escapeHtml` call sites and for any local replace-based escaping. Verify every dynamic interpolation site is covered. *`upload-markup-escaping` — "The page uses the shared helper rather than a private one".*
- [x] 1.6 Audit the destination control for a value injected into an attribute. `Modal.prompt` (`app.js:530-531`) interpolates `value` and `placeholder` into `value="…"` / `placeholder="…"` unescaped; confirm whether the path passed as `value` can contain a quote, and record the finding. If the destination control is replaced in phase 6 this becomes moot — record it either way rather than dropping it. *`upload-markup-escaping` — "Values inserted through attributes are escaped".*

*Phase 1 is independently shippable and closes the vulnerability on its own.*

---

## 2. Error disclosure pinning and failure taxonomy

*Reproduced defect: `errorHandler.js:20` gated `stack` on `config.env === 'development'`; `env.js:9` made that the default; neither `npm run dev` nor `npm start` sets `NODE_ENV`. **Corrected in the working tree during authoring** by work outside this change — the `stack` field is removed, `AppError` messages are forwarded verbatim, and every other message is replaced with a fixed generic string in all environments. See `design.md` D9. **This phase pins and verifies; it does not introduce a disclosure opt-in, and it does not edit `errorHandler.js` or `env.js`.***

- [x] 2.1 **First, read `src/middlewares/errorHandler.js` and record which variant is present.** If the `stack` field has been reinstated or a `DEBUG`-style opt-in introduced, **stop and re-apply the removal** — do not add an opt-in. Then continue. *`upload-error-disclosure` — "There is no disclosure switch to set"; `design.md` D9, Migration Plan ordering caveat.*
- [x] 2.2 Add `test/api/upload.surface.test.js`: assert an upload rejected for an invalid name returns a body with **no** `stack` field and **no** absolute path, and that the rejection reason is still present. Run against a live server with a temporary `STORAGE_ROOT`. This test must pass against the corrected handler; if it fails, 2.1 was not satisfied. *`upload-error-disclosure` — "No configuration discloses a stack".*
- [x] 2.3 Assert that with **no** environment selector configured at all, and again through the `npm start` path, no stack is disclosed. The original failure was precisely that absence of configuration was read as consent. *`upload-error-disclosure` — "An unset environment selector discloses nothing".*
- [x] 2.4 Assert that a failure **not** anticipated by a handler discloses a fixed generic message, and specifically that this holds for a failure carrying a **client-error** status. The superseded condition sanitised only `statusCode === 500` **and** only in production, so a `400` carrying a raw system message was never sanitised. Verify both the old and new variants are distinguished by this assertion. *`upload-error-disclosure` — "A non-expected failure never leaks through a non-500 status".*
- [x] 2.5 Assert that a deliberate, authored rejection reason is still forwarded to the client, so the generic-message rule did not swallow useful messages. *`upload-error-disclosure` — "An expected rejection keeps its own message".*
- [x] 2.6 Verify the server-side log still records the underlying error **and its location**, so removing client disclosure did not remove diagnosis. *`upload-error-disclosure` — "The underlying error is still recorded server-side".*
- [x] 2.7 In `public/assets/js/api.js` `upload()` (`:149-156`), attach the machine-readable kind from the parsed error body to the rejected `Error`, and preserve the existing human-readable message. Additive only: change no signature, no return shape, and no download helper. Verify the rejected error carries both the kind and the message. *`upload-error-disclosure` — "Upload failures carry a machine-readable kind"; `design.md` D4, R3.*
- [x] 2.8 In `uploads.js`, map failure kinds to display strings in **one** named lookup object; an unrecognised kind falls back to the server's own message rather than to a wrong label. Assert both branches. *`upload-queue-integrity` — "Failure reasons are distinguishable", "An unrecognised failure is still reported".*
- [x] 2.9 Assert the failure kind is **not** derived by pattern-matching the human-readable message. Grep the mapping for string comparisons against server prose. *`upload-error-disclosure` — "The failure kind is not derived from parsing prose".*
- [x] 2.10 Verify each serialised kind is a short stable token that is not reworded alongside the human-readable message. *`upload-error-disclosure` — "Kinds are stable identifiers, not sentences".*

---

## 3. Queue derivations and correctness

*Reproduced defects: `0s left` at `:457`/`:546`; `NaN` at `:539`; tiles reset by `clearCompleted` at `:349-353`/`:638-641`; global progress strands below 100% at `:588-624`.*

Per design.md D2, derivations become named pure functions exposed on the `Uploads` IIFE's returned object (`:814`), following the `app.js:1046-1050` precedent. **Extract first, preserving current behaviour including the defects; fix second, one defect per commit.**

- [x] 3.1 Extract `computeProgressPct(item)` and expose it. Preserve current behaviour exactly, then add a failing test for a zero-byte item asserting the output contains neither `NaN` nor `Infinity`. Verify the test **fails**. *`upload-queue-integrity` — "A zero-byte file produces a defined percentage".*
- [x] 3.2 Fix `computeProgressPct` to guard a zero size and to clamp to the range zero through one hundred. Verify 3.1 turns green, and that an aborted transfer's reported bytes never exceed the declared size. *Same requirement; "Transferred bytes never exceed the item size".*
- [x] 3.3 Extract `computeRemainingSeconds(item)` and expose it. Add a failing test asserting that zero measured speed yields **null**, not `0`. Verify the test **fails**. *`upload-queue-integrity` — "Zero measured speed yields an unavailable indicator".*
- [x] 3.4 Fix `computeRemainingSeconds` to return `null` when speed is zero, and route the result through `Format.duration` unchanged so the existing `—` convention applies (`app.js:215-223`). Verify 3.3 turns green. *design.md D6.*
- [x] 3.5 Label a computed remaining time as an estimate at both call sites (`:457` and `:546`). Verify the computed case carries the qualifier and the unavailable case does not. *`upload-queue-integrity` — "A measured speed yields a computed estimate".*
- [x] 3.6 Fix the in-place progress patch (`:536-551`) to use `computeProgressPct` and `computeRemainingSeconds` rather than its own inline arithmetic, which at `:539` has no zero guard. This is the path a string assertion cannot reach and is precisely how the `NaN` defect survived. Verify with a DOM-stubbed test asserting the patched `style.width` and the percentage text. *`upload-markup-escaping` — "The check covers the in-place patch path".*
- [x] 3.7 Extract `computeQueueTiles(queue)` and expose it. Add a failing test asserting the completed-count and transferred-bytes values are unchanged after completed rows are removed. Verify the test **fails** (current `clearCompleted` at `:349-353` drops both to zero). *`upload-queue-integrity` — "Clearing completed rows does not reset the tiles".*
- [x] 3.8 Move the tile inputs off the live queue onto a session-scoped accumulator that survives `clearCompleted`. Count only completed items and only their own sizes. Verify 3.7 turns green. *`upload-queue-integrity` — "A tile reflects only completed work".*
- [x] 3.9 Rename the tile labels to describe what is actually measured. **No time scope may remain in a caption** unless a source provides it — the word "today" at `uploads.html`-rendered copy is unsupported by any data source. Verify by asserting no tile caption contains a time scope. *`upload-surface-honesty` — "A tile never claims a time scope that no source provides".*
- [x] 3.10 Extract `computeGlobalProgress(queue)` and expose it. Add a failing test asserting a failed item's partial bytes are excluded from the numerator. Verify the test **fails**. *`upload-queue-integrity` — "A failed item does not reduce the completed fraction".*
- [x] 3.11 Fix `computeGlobalProgress` to sum completed and in-flight bytes only, and surface the failed count alongside the bar in `renderGlobalProgress` (`:588-624`) so a stranded percentage is explained. Verify 3.10 turns green. *`upload-queue-integrity` — "A stranded percentage is explained".*
- [x] 3.12 Verify the global progress region stays hidden when the queue is empty. *`upload-queue-integrity` — "An empty queue reports no progress".*
- [x] 3.13 Verify `clearCompleted` (`renderQueue`'s empty branch at `:430-441`) refreshes the tiles as well as the stats and global progress; it currently omits `renderMetrics`. *`upload-queue-integrity` — rendering consistency.*
- [x] 3.14 Verify retry semantics: a retried item resets transferred bytes to zero, clears its reason, and enters the queue exactly once; bulk retry touches only failed items. Cover `retryItem` (`:324-332`), `retryAllFailed` (`:355-370`), `pauseItem` (`:306-322`) and `resumeAll` (`:383-392`). *`upload-queue-integrity` — "Retrying is idempotent and resets progress".*
- [x] 3.15 Verify `cancelAll` (`:394-420`) filters to completed items only and that its confirmation states that completed files remain on the server and what happens to partial transfers. *`upload-page-interaction` — "Cancel all requires confirmation and states the consequence".*
- [x] 3.16 Remove the dead metrics state: `totalFiles`, `totalBytes`, `bytesUploaded`, `totalUploaded` are written but never read (`:28-34`, `:263`, `:295`). Confirm by grep that no read site remains after 3.8, then delete. *proposal.md Impact — dead code.*
- [x] 3.17 Remove the unused `randBetween` from the destructuring at `:10`. Verify no reference remains. *proposal.md Impact — dead code.*

---

## 4. Rendering cost

*Reproduced defects: `renderQueueItem` (`:533`) calls `bindQueueActions()` (`:553-563`), rebinding every row's listener per update; `renderMetrics` rewrites full `innerHTML` every second (`:297`, `:630-683`).*

- [x] 4.1 Add a test asserting that changing one row's state rewrites only that row's markup. Verify it **fails** against current code. *`upload-regression-coverage` — "Row updates are bounded to one row".*
- [x] 4.2 Add a test asserting the registered listener count is constant with respect to row count. Verify it **fails**. *`upload-regression-coverage` — "Listener count does not grow with rows".*
- [x] 4.3 Attach **one** delegated listener to `#queueList` and dispatch on `event.target.closest('[data-act]')`, reading `data-act` and `data-id` from the **matched** element rather than from `event.target` — a click landing on the icon inside the button must still resolve. Delete `bindQueueActions` and both call sites (`:444`, `:533`). Verify 4.1 and 4.2 turn green. *design.md D3.*
- [x] 4.4 Add a test asserting the interval update preserves summary node identity — the same node objects before and after. Verify it **fails**. *`upload-regression-coverage` — "The interval update preserves node identity".*
- [x] 4.5 Rewrite `renderMetrics` (`:630-683`) to update each tile's value and label in place instead of replacing `wrap.innerHTML`, so focus and hover state survive the once-per-second tick. Verify 4.4 turns green. *`upload-queue-integrity` — "The interval update mutates values rather than replacing markup".*
- [x] 4.6 Cap and group toasts: `Toast.show` (`app.js:378-419`) appends uncapped, and `processUpload` fires one per file at up to eight concurrent. Add a maximum and a coalescing key for repeated completion messages, and consolidate completions rather than announcing one per file. Verify a burst produces a bounded stack. *`upload-page-accessibility` — "Repeated completion does not flood the announcement"; proposal.md defect F17.*
- [x] 4.7 Verify a several-hundred-item queue remains operable through add, pause, cancel and clear. `.queue-list` already bounds height (`uploads.css:323-328`); confirm the page does not freeze. *`upload-queue-integrity` — "A large queue remains operable".*

---

## 5. Honesty and copy

*Reproduced defect: `renderRecent()` (`:729-737`) hardcodes seven invented files under the heading "Recently uploaded · from all admins" (`uploads.html:355`). Nine further capability claims have no implementation.*

- [x] 5.1 Add a source-inspection test asserting the page contains no hardcoded recent-uploads array and no unimplemented capability claim string. Verify it **fails** against current code. *`upload-surface-honesty` — "No hardcoded file list is presented as real"; `upload-regression-coverage` — "Copy-absence checks fail before the fix".*
- [x] 5.2 Replace `renderRecent` with a reader of `activities` from the existing `GET /api/dashboard/summary` (`dashboard.controller.js:156`), filtered to `type === 'upload'`. **Add no endpoint** — see design.md D5. Handle all three states: populated, empty, and source-unreachable. Verify each renders distinctly, and that an unreachable source is not shown as empty.
- [x] 5.3 A recorded activity carries `{type, user, action, target, folder, time}` and **no byte size**. Drop the size from the card rather than substituting one; if a size is required, resolve it from the folder listing and state the cost. *design.md D5, R5.*
- [x] 5.4 If 5.2 cannot be completed against the existing payload, **remove the section** rather than substituting placeholder content. An absent section satisfies `upload-surface-honesty`; a hardcoded array does not. Record which path was taken.
- [x] 5.5 Remove the "from all admins" attribution (`uploads.html:355`) — no users or auth exist. Verify no attribution to people or accounts remains anywhere on the page. *`upload-surface-honesty` — "User attribution is not invented".*
- [x] 5.6 Delete every unimplemented capability claim. Verified inventory in `public/uploads.html` and `public/assets/js/uploads.js`: checksum verification and CDN distribution across "42 edge points-of-presence" (`:218-220`); "Auto-encrypted in transit" (`:243-245`); "Auto-retry on failure" (`:247-249`); "Uploads resume automatically after network interruptions" (`:340`); "Uploads resume from the last checkpoint" (`:393`); "save up to 40% space" (`:385-386`); "Compress & deduplicate before upload" (`:63`); "Client-side encryption enabled" (`:75`). Verify each string is absent. *`upload-surface-honesty` — "Unimplemented claims are removed".*
- [x] 5.7 Do **not** delete "Max 5 GB per file" (`:235-237`) — verify against the 0.1/0.3 gate that the server enforces the stated maximum, and that the number reflects the value actually in effect. If the server enforces no maximum, remove the claim rather than leaving it unenforced. *`upload-surface-honesty` — "A size cap is server-enforced before it is stated".*
- [x] 5.8 Make presets honest. Currently `renderPresets`' handler (`:712-714`) mutates only `state.concurrency` and `state.options.compress`, and `compress` is never transmitted — `processUpload` sends only `destination`, `overwrite`, `preservePath` (`:230-232`). Either transmit what a preset claims or delete the claim from that preset and its tags. Verify no preset tag names a setting that is not applied. *`upload-queue-integrity` — "A preset effect that is not transmitted is not advertised"; `upload-surface-honesty` — "Preset tags describe real settings".*
- [x] 5.9 Verify the preset marked active on load is the preset whose settings are in effect (`state.preset` at `:21` versus the rendered `is-active`). *`upload-queue-integrity` — "The default preset is reflected in the interface".*
- [x] 5.10 Rewrite the "Pro tips" list (`uploads.html:379-396`) so every tip describes actual behaviour. Verify each referenced preset exists and each described effect is real. *`upload-surface-honesty` — "Tips correspond to real presets".*
- [x] 5.11 Verify no percentage saving, trend, or comparison is rendered without a measured baseline, and that no instantaneous value is captioned as a trend. *`upload-surface-honesty` — "No comparison is shown without a baseline".*
- [x] 5.12 Remove the hardcoded `/releases/2025` placeholder (`uploads.html:265`), which `init` overwrites with `/` at `:811`. Verify no placeholder path is present in the markup and that the first render shows the real destination. *`upload-destination-selection` — "No placeholder path is shown before the first render".*

---

## 6. Interaction

*Reproduced defects: dropzone is keyboard-dead (`uploads.html:210` has `tabindex="0"` and `role="button"`; `initDropzone` at `:84-148` registers no `keydown`); page-wide drop adds nothing (`:146`) while two strings promise it works (`:435`, `uploads.html:190`); three nested `<label>` pairs (`:273-293`); destination is unvalidated free text (`:760`).*

- [x] 6.1 Add a source-level check asserting no `<label>` nests another `<label>` in `uploads.html`. Verify it **fails** against current markup. *`upload-regression-coverage` — "Well-formedness checks fail before the fix".*
- [x] 6.2 Rewrite the three option toggles (`:273-293`) as a single valid `<label>` per option, with the visible text inside it. **Add no JavaScript to compensate.** Verify 6.1 turns green, and verify clicking the visible text toggles the option. *`upload-page-interaction` — "No control nests inside another label"; design.md D7.*
- [x] 6.3 Verify each option input has exactly one associated label and that its state is exposed through the input's checked state, not only drawn by the track. *`upload-page-interaction` — "The state is exposed, not only drawn".*
- [x] 6.4 Add `Enter` and `Space` activation to the dropzone. Handle the space key's default scroll, and suppress the dropzone's own handler when a control inside it is activated so the picker does not open twice. *`upload-page-interaction` — "Keyboard activation opens the picker", "Activation does not recurse".*
- [x] 6.5 Decide and implement the page-wide drop contract: either route a window-level drop to `addFiles` with visible confirmation, or refuse it visibly. Either way remove the window handler's current behaviour of silently clearing the highlight and discarding the files, and update both strings at `uploads.js:435` and `uploads.html:190` to match. *`upload-page-interaction` — "The page-wide drop contract matches its copy".*
- [x] 6.6 Ensure a drop anywhere on the page never navigates away, discarding the queue. Verify with a dropped non-file payload that the page does not navigate. *`upload-page-interaction` — "Dropping a non-file payload does not disturb the page".*
- [x] 6.7 Add the `relatedTarget` guard to the window-level `dragleave` counter (`:142-145`), mirroring the dropzone handler at `:125`, so the highlight does not clear while the pointer crosses child elements. Verify by moving a drag within the dropzone. *`upload-page-interaction` — "Highlighting survives movement across child elements".*
- [x] 6.8 Verify the highlight counter cannot go negative and cannot strand the highlight on under any interleaving of enter and leave. *`upload-page-interaction` — "The highlight counter cannot go negative".*
- [x] 6.9 Replace the free-text destination prompt (`:760`) with folder selection drawn from `GET /api/fs/tree`. **The tree endpoint reaches exactly two levels** (`fs.controller.js:28-29`, `depth > 2` returns `[]`) — do not present it as the complete folder set. Retain typed entry, validated. *design.md Context; `upload-destination-selection` — "The offered depth is stated, not overstated".*
- [x] 6.10 Validate the destination **before** the first transfer starts, distinguishing "does not exist" from "cannot be written to", so a bad destination does not produce one failure per queued file. *`upload-destination-selection` — "An unusable destination is reported once".*
- [x] 6.11 Offer to create a missing destination via the existing `POST /api/fs/folder` (`fs.controller.js:165-190`); add **no** endpoint. On success make it current; on failure leave the current destination unchanged. Never create a directory as a side effect of an upload. *`upload-destination-selection` — "A missing destination can be created"; design.md D10.*
- [x] 6.12 Reject an absolute operating-system path as a destination, and ensure a rejected value is not echoed into the page markup and is not displayed as current. *`upload-destination-selection` — "An absolute path is rejected", "A rejected destination is not displayed as current".*
- [x] 6.13 Snapshot the destination per item at queue time so a later destination change does not retroactively move already-queued items, and make the items' target destination discoverable. *`upload-destination-selection` — "A destination change does not retroactively move queued items".*
- [x] 6.14 Verify every presented option toggle is transmitted and acted on, or is removed. *`upload-queue-integrity` — "A presented option is transmitted"; "An option with no server behaviour is removed".*
- [x] 6.15 Verify bulk actions affect only the states their labels name (`pauseAll` `:372-381`, `resumeAll` `:383-392`), that concurrency changes are reflected without aborting transfers already in flight, and that a bulk action on an empty queue is harmless. *`upload-page-interaction` — "Bulk queue actions are predictable".*

---

## 7. Accessibility and responsive density

*Reproduced defects: icon-only queue buttons have no accessible name (`:463-495`); `[data-tip]` is CSS-only and `:hover`-only (`components.css:1082`, `:1102`) with no `:focus-visible`; no live region on `#uploadMetrics` / `#queueStats` / `#queueGlobal` / `#queueList`; `uploads.css:763` hides every action bar that is not `.keep-mobile`, so Cancel is unreachable below 560px.*

- [x] 7.1 Give every icon-only queue control an accessible `aria-label`, and rename it when the control's meaning changes — the resuming control must not be named as pausing. *`upload-page-accessibility` — "Icon-only queue controls are named", "A control whose meaning changes is renamed".*
- [x] 7.2 Add `:focus-visible` tooltip support alongside the existing `:hover` rule in `public/assets/css/components.css` (`:1102`). Verify keyboard focus reveals the tooltip. *`upload-page-accessibility` — "Tooltips are available without a pointer"; design.md D11 scope note for `components.css`.*
- [x] 7.3 Audit **every** button on the page for an accessible name, including the topbar and page-header controls in `uploads.html`, and add names where absent. *`upload-page-accessibility` — "Icon-only controls elsewhere on the page are named".*
- [x] 7.4 Add a live region for the queue summary and the overall progress, throttled so the once-per-second tick does not re-announce on every intermediate value. Mark the row container busy while transfers are in flight and clear it when none remain. *`upload-page-accessibility` — "Transfer state is announced".*
- [x] 7.5 Remove `role="button"` from the dropzone (`:210`) so it is not a button containing focusable controls, keep it focusable and keyboard-activatable per 6.4, and expose an accessible description of what dropping there does. Verify the inner file and folder controls remain individually reachable and named. *`upload-page-accessibility` — "The dropzone exposes valid structure"; `upload-page-interaction` — "Keyboard activation opens the picker".*
- [x] 7.6 Confirm the two file inputs stay out of the accessibility tree while remaining reachable programmatically for the browse actions — they are `display:none` (`uploads.css:150`) and `aria-hidden`, so verify neither removal of the role nor the role change reintroduces them. *`upload-page-accessibility` — "Hidden inputs are hidden from the accessibility tree".*
- [x] 7.7 Mark purely decorative icons `aria-hidden` across the page. *`upload-page-accessibility` — "Decorative icons are hidden".*
- [x] 7.8 Delete the blanket hide rule at `uploads.css:763` and restore full action parity at narrow widths. **Do not** add `.keep-mobile` to Cancel — that would leave completed and queued rows with no control. Verify at 320px that an in-flight item can be cancelled and every row state can be resolved. *`upload-page-accessibility` — "Queue controls are available at every viewport"; design.md D8.*
- [x] 7.9 Verify no horizontal overflow and no unclippable text at a 320px viewport. *`upload-page-accessibility` — "No horizontal overflow at the narrowest supported viewport".*
- [x] 7.10 Verify the page exposes exactly one primary heading and that section headings descend without skipping a level. *`upload-page-accessibility` — "The page exposes one coherent heading structure".*
- [x] 7.11 Verify a visible focus indicator renders for the dropzone and every control inside it. *`upload-page-interaction` — "Focus is visible".*

---

## 8. Documentation

- [x] 8.1 Record in `docs/CONTRACTS.md`: the upload failure classes, their statuses, and their machine-readable kinds; the destination-creation affordance; and the error-disclosure rule — no stack in any environment, authored rejection messages forwarded, everything else generic, full detail in the server log. Note that the disclosure rule applies to **every** endpoint, not only upload. Reference the shared capability `upload-destination-integrity` for placement semantics rather than restating them. *`upload-regression-coverage` — "The contract document records the failure classes".*
- [x] 8.2 Record the claim inventory removed in phase 5, so the removals are visible and reversible if a capability is later built. *design.md R6.*
- [x] 8.3 Update `docs/REPO_MAP.md` to list `test/frontend/uploads.test.js` and `test/api/upload.surface.test.js`. *`upload-regression-coverage` — "The navigation document lists new files".*
- [x] 8.4 Add the new page invariants to `AGENTS.md`: a queue-derived figure is labelled with its scope; unknown is rendered unavailable and never as zero; no capability is claimed without server behaviour; every dynamic interpolation is escaped; every icon-only control has an accessible name. *`upload-regression-coverage` — "The operating rules record the new invariants".*
- [x] 8.5 Add `docs/decisions/ADR-004-upload-page-integrity.md` recording D1 (consume the shared upload contract), D5 (real activity or no section), D9 (never disclose a stack — noting it was resolved in the working tree rather than by this change), and D12 (scoped test discovery), each with the alternative rejected. *proposal.md Impact.*
- [x] 8.6 Confirm `AGENTS.md` and `docs/CONTRACTS.md` reflect the shipped behaviour and that no statement in either contradicts a requirement in `specs/`. *`upload-regression-coverage` — "Documentation tracks the shipped behaviour".*

---

## 9. Integration and browser verification

- [x] 9.1 **Gate.** Verify no pre-existing test was removed or weakened, and that the full suite passes with the same-or-higher test count. *`upload-regression-coverage` — "The baseline suite remains green".*
- [x] 9.2 Verify a scratch file outside `test/` that would fail if run as a test is not discovered, and that the suite's exit status is unaffected. *`upload-regression-coverage` — "A scratch file outside the test directory is ignored".*
- [x] 9.3 Verify no test writes outside a temporary directory and that the configured production storage root is untouched by the suite.
- [x] 9.4 Verify no live-server test reads or writes `data/metadata.json` in the repository working tree. During investigation, probes polluted it with fabricated activity records that had to be removed by hand; the suite must not repeat that. *`upload-regression-coverage` — "The suite uses a temporary storage root".*
- [x] 9.5 **Browser pass, keyboard only.** Traverse the entire page with <kbd>Tab</kbd>: the dropzone activates, every queue control is reachable and named, the destination control is operable, and no trap exists. Record the result in this change. *design.md R8.*
- [x] 9.6 **Browser pass, viewport matrix.** Verify layout and full queue operability at 320, 560, 768, 1024 and 1440px, specifically that an in-flight upload is cancellable at 320px. Record the result. *`upload-page-accessibility` — viewport requirements.*
- [x] 9.7 **Browser pass, drag and drop.** Verify drop-on-dropzone, drop-outside-dropzone, cross-child drag without highlight flicker, and that no drop navigates the page away. Record the result. *`upload-page-interaction`.*
- [ ] 9.8 **Browser pass, assistive technology.** Confirm the live region announces queue and progress changes, that a zero-byte file announces no `NaN`, and that unavailable remaining time is announced as unavailable. Record the result. *`upload-page-accessibility`.*
- [x] 9.9 Verify a file named with markup-significant characters renders as literal text in a real browser and executes nothing, in both the initial row render and the in-place progress patch. *`upload-markup-escaping`.*
- [x] 9.10 Confirm the shipped server footprint matches design.md D10: no route, no controller, and no service was added by this change. Verify by inspecting the diff.
- [x] 9.11 Record the platform and Node version the suite was verified on, and state explicitly that Linux was not exercised. *design.md Migration Plan — Verification environment.*

---

## Dependency chain

```
0.1-0.3 gate ──┬─> 3 queue derivations ──> 4 rendering cost ──┐
               │                                              │
0.5  test scope┼─> 1 escaping (independent) ─────────────────┤
0.7  harness ──┘                                              │
                                                              ├─> 8 docs ──> 9 verification
2 pin disclosure + taxonomy (needs 0.3, 0.4) ─────────────────┤
5 honesty (needs 1, 3.9) ─────────────────────────────────────┤
6 interaction (needs 1, 5.12) ────────────────────────────────┤
7 accessibility (needs 3.6, 4.6, 6.4) ───────────────────────┘
```

Phase 1 depends only on 0.5 and 0.7 and may start as soon as those land. Phases 3–7 all write `uploads.js` and `test/frontend/uploads.test.js` and are therefore strictly sequential in the order shown.

## Definition of Done

- [x] Every acceptance criterion in `proposal.md` is satisfied and individually verified.
- [x] Every scenario in every file under `specs/` is either covered by an automated check or explicitly recorded in §9 as browser-verified with its result.
- [ ] Every task above is checked.
- [x] `npm test` exits `0`, the test count has not decreased, and no test lives outside `test/`.
- [x] `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `AGENTS.md` and ADR-004 reflect the shipped behaviour.
- [x] The server footprint matches design.md D10 — no new route, controller, or service, and no edit to `errorHandler.js` or `env.js`.
- [x] The §0 gate verdicts are recorded, including any escalation raised by 0.2.

---

## Implementation record (2026-10-03)

Verified on **Node v24.15.0, win32 x64**. **Linux was not exercised.** `npm test`: 465 tests before,
**560 after** (95 added: `test/frontend/uploads.test.js` 84, `test/api/upload.surface.test.js` 11), exit `0`.
No pre-existing test was edited or removed. Against the pre-change page code the new suites report
80 failures of 95 (the 15 passes are server-side checks that already held, plus source checks the old
code happened to satisfy) — the fail-first evidence for §1–§7.

### §0 gate verdicts

- **0.1 PASS.** Placement is decided after the body is parsed (`UploadService`, landed with
  `files-page-correctness`); `test/api/fs.contract.test.js` asserts the file on disk for both field
  orders, and `data.path` equals the path written. Re-checked in `upload.surface.test.js`
  ("a successful upload lands where it says it did"). 0.2 escalation not needed.
- **0.3 Recorded.** Statuses per class: name rejection `400`, missing destination `400`, destination
  not a folder `400`, collision `409`, oversize `413` (message names the limit in bytes), traversal
  `403`. **No machine-readable `kind` is sent by the server.** Phase 2 degrades honestly: kinds come
  from the status (`409`/`413`/`403`/`5xx`) and the transport (`network`, `aborted`); the three `400`
  classes show the server's authored message. `api.js` honours a `kind` field if the server adds one.
  `preservePath` has **no server behaviour** (the option was removed from the page, 6.14).
- **0.4** Neither `errorHandler.js` nor `env.js` was edited.
- **0.5 / 0.6 Already in the tree** before this change began (`"test": "node --test \"test/**/*.test.js\""`;
  one `/api` catch-all in `server.js`). Verified, not re-done. `server.js` and `package.json` are
  untouched by this change.
- **0.7** Harness: `vm` context with real `app.js`, stub `window`/`document`/`XMLHttpRequest`
  (`uploads.js` must not construct an XHR itself), mirroring `files.test.js`.

### Findings and paths taken

- **1.6** `Modal.prompt` (`app.js`) interpolates `value` and `placeholder` into attributes unescaped,
  so a path containing `"` could break out of `value="…"`. **Moot for this page:** the destination
  control no longer uses `Modal.prompt` (a test pins that). The helper itself is unchanged and other
  callers must keep escaping what they pass (AGENTS.md rule 10).
- **2.1** `errorHandler.js` holds the corrected variant (no `stack`, `AppError`-only forwarding,
  generic text at every status). No opt-in added.
- **4.6** `Toast` gained a visible cap (`MAX_VISIBLE = 4`, oldest dismissed); the page consolidates
  completions and failures into one toast per burst (1.2 s window).
- **5.2 / 5.4** Path taken: **implemented**, not removed. The strip reads `activities` from
  `GET /api/dashboard/summary`, filtered to uploads; populated / empty / unreachable are distinct.
  Activities carry no size, so none is shown (5.3). Note: the summary endpoint returns at most 8
  activities of all types, so the strip shows uploads among those, and its subtitle says so.
- **5.7** "Max 5 GB per file" **removed**, and so was the client-side 5 GB pre-check: the server's
  limit is `UPLOAD_MAX_BYTES` (configurable, not reported to the client), so a fixed number could be
  wrong. The `413` row reason carries the limit actually in effect.
- **5.8** Presets now change concurrency only (Fast 8 / Balanced 3 / One at a time 1); tags are
  derived from that value. Optimize Storage and Secure Upload were removed.
- **6.5** Contract chosen: **a drop anywhere on the page is accepted** and confirmed with a toast;
  every drop (file or not) is prevented from navigating. A dropped folder is walked
  (`webkitGetAsEntry`), its files queued flat.
- **6.9–6.13** Folder `<select>` from `GET /api/fs/tree` (two-level bound stated beside it) plus a
  typed path. A destination is checked with `GET /api/fs/list?path=…&limit=1` before anything is sent;
  failures hold the affected items under one notice. "Cannot be written to" is reported from a `403`;
  write permission itself cannot be probed without uploading.
- **Additions not named in a task:** a **Start queued** button (with Auto-start off there was no way
  to start the queue); the tips list became a real `<ol>` (its `.numbered-*` styles only exist in
  `dashboard.css`, which this page never loaded, so it rendered unstyled before this change too).

### §9 browser verification (Claude browser pane, Chromium, against a live server with a temporary `STORAGE_ROOT` and `UPLOAD_MAX_BYTES=65536`)

- **9.5 Keyboard only — PASS.** Tab order: page heading → Pause all → Resume all → dropzone → Choose
  files → Choose folder → Change → two option switches → three presets → Start queued → Retry failed →
  Clear completed → row controls → Cancel all pending → View all → sidebar → topbar; no trap; every
  stop showed an outline. Enter and Space on the dropzone each opened the picker once, Space did not
  scroll; Enter on Choose files opened it once (no double activation). Destination picker operated
  by keyboard (Enter applies; focus returns to Change on close).
- **9.6 Viewport matrix — PASS.** `scrollWidth == clientWidth` at 320, 560, 768, 1024 and 1440 (the
  recent strip scrolls horizontally inside its own container by design). At 320 px an in-flight row
  showed Pause + Cancel, queued showed Remove, paused showed Resume + Remove; a real click on Cancel
  aborted the in-flight transfer.
- **9.7 Drag and drop — PASS (synthetic `DragEvent`s with real `File` objects).** Drops onto the
  page queued files and confirmed them; nothing navigated. Highlight logic is covered by unit tests
  (`createDragState`); a physical cross-child drag with a real pointer was **not** performed.
- **9.8 Assistive technology — PARTIAL.** No screen reader was available. The live region text was
  read directly: e.g. "0 uploading, 0 queued, 2 complete, 2 failed. Overall 100%."; a zero-byte file
  produced "Overall 100%" and no `NaN`/`Infinity` anywhere on the page; unavailable time renders as
  "— left" without "estimate". Actual speech output is **not verified**.
- **9.9 Hostile name — PASS.** A file named `<img src=x onerror=alert(1)>.txt` rendered as literal
  text in its row, no element was injected, `alert` never fired; the server then refused the name
  with its authored reason. The in-place progress patch is covered by a unit test.
- **Also observed:** OS path `C:\Windows` refused and not displayed; `/newdir` reported missing,
  created via the Create button and made current; a collision in `/docs` reported "already in the
  destination… turn on Replace…"; an oversize file reported the 64 KB limit; keyboard focus on a
  row control revealed its tooltip.
- **9.10** No route, controller or service added; `server.js`, `errorHandler.js`, `env.js`,
  `fs.controller.js` and `fs.routes.js` untouched. Client files changed: `uploads.js`,
  `uploads.html`, `uploads.css`, `components.css` (tooltip focus rule), `api.js` (additive `status` /
  `kind` / `silent`), `app.js` (toast cap).
- **9.3 / 9.4** Every new server-booting test uses a temp `STORAGE_ROOT` and a temp metadata file;
  the child-process test runs with `cwd` in the temp dir. The repository's `data/metadata.json` was
  unchanged after full runs.
