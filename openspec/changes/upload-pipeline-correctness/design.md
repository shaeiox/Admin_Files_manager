# Design

## Context

See `proposal.md` → *Why* for motivation. This section records only the current state and constraints that shape the approach.

**Repository state.** Node.js CommonJS Express 5 app, layered `routes → controllers → services → fs`. Client is vanilla JS with no build step: IIFE modules attach to `window`, loaded by `<script>` order. `uploads.js` is a self-registering IIFE that returns only `{ init }` (`:814`) and assigns `window.Uploads` (`:823`); everything else in it — `state`, `addFiles`, `processUpload`, `renderItemHTML`, `renderMetrics`, `presets` — is module-private. That privacy is the single most important structural constraint on this change: **nothing in `uploads.js` is currently reachable from a test.** See D11.

**Shared helpers available and unused on this page.** `window.AFM` exports `escapeHtml` (`app.js:1049`), `Format.duration` which already returns `—` for a non-finite or negative input (`app.js:215-223`), `Format.speed`, `clamp`, `uid`, `resolveType`, `Toast`, and `Modal` with `confirm` and `prompt`. `window.API.upload(endpoint, formData, onProgress)` (`api.js:124-169`) already returns `{promise, abort}` and is the correct seam; it is not modified by this change. **The unavailable-value convention already exists in the codebase** — `Format.duration` is the proof — so this change applies an existing convention rather than inventing one.

**No DOM test harness exists.** `test/frontend/app.test.js:9-16` records the constraint explicitly: *"The repository installs no DOM test harness and this change may not add one, so exactly two globals are stubbed."* That file `require()`s the browser script after setting `globalThis.window` and a minimal `globalThis.document` exposing only `querySelector`. This change follows the same pattern. See D11.

**Filesystem-tree endpoint depth is a hard constraint on the destination picker.** `getTree` (`fs.controller.js:17-45`) builds a root node and calls `scanFolders(clientPath, depth = 1)`, which returns `[]` when `depth > 2`. **The tree endpoint reaches exactly two levels.** A folder picker built only on this endpoint cannot reach a folder nested three or more levels deep. This is a measured property of the existing endpoint, not an assumption.

**Destination creation already exists.** `POST /api/fs/folder` (`fs.controller.js:165-190`) validates the client path and the basename, calls `FileSystemService.createDirectory`, records activity, and returns `201 {success, data:{path}}`. `FileSystemService.createDirectory` (`FileSystemService.js:88`) and `FileSystemService.exists` (`:71`) are available. No new endpoint is needed to create a destination.

**Real upload activity is already recorded and already exposed.** `MetadataService.addActivity` is called on every successful upload with `{type:'upload', user:'system', action:'uploaded', target, folder, time}` (`fs.controller.js:374-380`). `MetadataService.getActivities(limit)` (`MetadataService.js:157-167`) already filters out non-numeric and non-positive timestamps and returns an array. `GET /api/dashboard/summary` already returns an `activities` array (`dashboard.controller.js:156`). **The recently-uploads strip needs no new endpoint** — it reads `activities` and filters `type === 'upload'`. See D5.

**Error envelope and stack gate — as found, then as changed underneath us.** When investigation began, `errorHandler.js:16-22` emitted `{success:false, error, stack}` where `stack` was `config.env === 'development' ? err.stack : undefined`. `env.js:9` sets `env: process.env.NODE_ENV || 'development'`. Neither `npm run dev` (`nodemon server.js`) nor `npm start` (`node server.js`) sets `NODE_ENV`, so **the default in every documented start path disclosed stacks.** `errorHandler.js:12` separately sanitised the message only when `env === 'production' && statusCode === 500`, which left every non-500 failure — including a `400` from name validation, which carried `err.message` and was in fact an authored static string, and any non-`AppError` failure, which was not — unsanitised in production.

**During authoring, `src/middlewares/errorHandler.js` was modified in the working tree** (uncommitted; by work outside this change; see D9). It now removes the `stack` field entirely, forwards `AppError` messages verbatim, replaces every other message with a fixed generic string in all environments, and logs `err.stack` server-side only. `src/config/env.js` was **not** changed, so `config.env` still defaults to `'development'` — but nothing reads it for disclosure any more. **This change does not edit either file.** Its residual responsibility is to pin the behaviour with a test and to document it.

**Verified runtime.** Node v24.15.0, win32 x64. All reproduced behaviour in `proposal.md` was measured against a live Express instance with a temporary `STORAGE_ROOT`, not inferred from source. One hypothesis was tested and **disproved**: an aborted upload does **not** leave an orphaned partial file — multer 2.x cleans up on stream abort, confirmed by destroying a request mid-stream and then listing the destination, which came back empty. `upload-queue-integrity`'s abort requirement is therefore a *regression guard*, not a defect fix, and is scoped as such.

**Not verified at authoring time.** Behaviour inside a real browser — actual focus order, actual screen-reader output, actual layout at 320px, and whether the nested-`<label>` parser behaviour manifests identically across engines — cannot be measured in this environment. Those requirements are written against the HTML and ARIA specifications and are validated by the implementer in a browser, and by source inspection in the automated suite.

---

## Goals / Non-Goals

**Goals.**

- Every number the page renders is either a real measurement or an explicit unavailable marker.
- Every capability the page claims is one the server implements, or is removed.
- The queue stays correct and responsive at sizes a folder drop actually produces.
- The page is fully operable by keyboard and at a 320px viewport.
- Zero new runtime dependencies, and no DOM test harness.
- Client-safe rendering of any untrusted string.

**Non-Goals.**

- **Server-side upload placement.** Field ordering, overwrite policy, `preservePath`, and size limits are owned by `files-page-correctness`. See D1.
- **CORS and CSP policy.** `server.js:16-19` is escalated by `files-page-correctness`. Recorded here as a dependency only. See R1.
- **Authentication / authorization.** Explicitly excluded by the operating rules of this repository and out of scope for a page-level change.
- **Chunked or resumable transfer.** `upload-queue-integrity` requires pause to reset to zero *because* there is no chunking. Adding chunking would be a transport redesign belonging to the server-side change.
- **Client-side compression, encryption, or deduplication.** The honest fix for presets that claim these is removal, not implementation. Implementing them is a separate product decision.
- **Modifying `public/assets/js/api.js`.** Its `upload()` helper is already correct.
- **The Files page.** `files.js` and `files.html` are not touched.
- **A shared layout mechanism.** The sidebar block in `uploads.html` is duplicated across four pages with no shared mechanism; collapsing it is `files-page-correctness` work.

---

## Decisions

### D1 - Consume the server upload contract; do not re-specify or re-implement it

`files-page-correctness` independently reproduced the same multipart field-ordering defect from the Files page and has claimed a capability named `upload-destination-integrity` covering field ordering, truthful response paths, overwrite policy, size limits, abort, per-file errors, and folder drops. Those are exactly reproduced defects 1–4 in `proposal.md`.

**Decision.** This change treats the upload *placement* contract as a **precondition**, verified by a gate (§0 of `tasks.md`) rather than re-specified. Where the Upload page needs a server signal, this change requires the signal (see D4) without owning its production.

**Alternatives considered.**
- *Duplicate the server fix here.* Rejected: two changes editing `fs.controller.js:327-391` concurrently will conflict, and two specs asserting the same requirement at different paths will collide at archive time. The sibling already owns that file and that behaviour.
- *Re-specify the shared capability under the same path.* Rejected: this change cannot know whether the sibling's delta already covers a given requirement, so a same-path delta would either duplicate or silently contradict it. The gate plus an escalation note is the honest coordination mechanism.
- *Block on the sibling entirely.* Rejected: this change contains independently shippable work (escaping, copy removal, accessibility) that must not wait.

**Escalation, not silent absorption.** If §0 finds the placement contract unimplemented, §0's task list requires recording that fact and re-planning the server portion as its own change, rather than quietly expanding this one.

### D2 - Make queue derivations pure and export them for testing

Every defect in `upload-queue-integrity` lives in a derivation: percentage, remaining time, tile values, global progress, failure kind. All of them currently live inside private functions or inline inside render functions.

**Decision.** Convert each into a **named, pure function that takes state and returns a value or an explicit unavailable marker**, call it from the renderer, and expose the set on the returned object of the `Uploads` IIFE — the same way `app.js:1046-1050` exposes `resolveType`, `Format`, and `escapeHtml`. `window.Uploads` (`:823`) already exists as the public handle.

**Rationale.** This is the minimum change that makes the queue testable under the no-DOM-harness constraint (D11). It is not a refactor for its own sake: without it, the zero-byte, unavailable-ETA, tile-survival, and global-progress requirements are all unassertable.

**Alternatives considered.**
- *Test through rendered markup with a stubbed `document`.* Rejected: `renderItemHTML` returns an HTML *string*, so a string assertion would work — but `updateItemProgress` and the tile values require DOM nodes. Extracting pure derivations covers both uniformly and is cheaper to assert.
- *Leave the functions private and test only the strings.* Rejected: `updateItemProgress` (`:536-551`) writes `node.style.width` and `node.textContent`; a string assertion cannot reach it, which is precisely how the `NaN` defect survived.
- *Introduce a module system or a bundler.* Rejected: violates the no-build-step rule.

### D3 - One delegated listener on the queue container

`renderQueueItem` (`:525-534`) calls `bindQueueActions()` (`:553-563`), which iterates **every** `[data-act]` node in `#queueList` and assigns `.onclick`. Called once per row state change, that is O(n) per update.

**Decision.** Attach **one** listener to `#queueList` in `initDropzone`/`init` and dispatch on `event.target.closest('[data-act]')`, reading `data-act` and `data-id` from the matched element. Delete `bindQueueActions` and its call sites.

**Rationale.** Listener count becomes constant regardless of queue size, which is directly assertable (`upload-regression-coverage`, "Listener count does not grow with rows").

**Consequence to handle.** The existing handler reads attributes from the bound element (`btn.getAttribute('data-act')`). The delegated handler must read them from the *matched* element, not from `event.target`, or a click landing on the icon inside the button will find nothing. This is the one behavioural detail that makes or breaks D3.

### D4 - Map server failures to kinds from a machine-readable signal

`api.js:149-156` currently flattens every non-2xx into `new Error(message)` built from `xhr.statusText` or a parsed `error`/`message` field. `upload-error-disclosure` requires a stable machine-readable kind.

**Decision.** `API.upload` reads an optional machine-readable kind from the parsed error body and attaches it to the rejected `Error` (for example `err.kind`). `uploads.js` maps that kind to a display string. The mapping table lives in one named object so a new server kind degrades to the server's own message rather than to a wrong label.

**Rationale.** The alternative — pattern-matching the human-readable message — is exactly the class of defect this change exists to remove, and `upload-error-disclosure` forbids it by name.

**Boundary.** `api.js` is listed as *untouched* for its **download** helpers. Adding a `kind` property to the error object `upload()` already constructs is a purely additive change to that helper and does not alter any existing signature, return shape, or download path. It is recorded here explicitly so the file-ownership boundary is not silently crossed — see R3.

### D5 - Source the recent-uploads strip from `GET /api/dashboard/summary`, or delete it

`renderRecent()` (`:725-751`) hardcodes seven entries.

**Decision, in order of preference.**
1. Read `activities` from the existing `GET /api/dashboard/summary`, filter to `type === 'upload'`, and render those. `dashboard.controller.js:156` already returns the array; `getActivities` (`:157-167`) already sanitises timestamps. **No new endpoint.**
2. If the payload shape proves insufficient at implementation time, remove the section entirely rather than inventing a source.

**Rationale.** Option 1 needs no server change and no new route, so it cannot collide with `dashboard-real-data` (109/112 tasks complete, owns `dashboard.controller.js`). Option 2 is the guaranteed-honest floor: an absent section violates no requirement, whereas a hardcoded array violates `upload-surface-honesty` outright.

**Consequence to handle.** A recorded upload activity carries `{type, user, action, target, folder, time}` — it has **no byte size**. The strip currently renders a size. Options: drop the size from the card, or resolve it from `GET /api/fs/list` for that folder. Dropping it is preferred; a size the activity record does not contain would be a fabrication. This is a real design consequence, not a detail.

### D6 - Unavailable is a value, not an absence

`Format.duration(sec)` (`app.js:215-223`) already returns `—` for null, non-finite, or negative input. The defect is that callers never let it see an unknown: `uploads.js:457` and `:546` compute `remaining = item.speed ? (size - uploaded) / speed : 0`, coercing unknown into `0`, which renders as a confident `0s`.

**Decision.** Derivation functions return `null` for unknown (D2), and renderers pass that `null` straight into the existing formatter. No new marker, no new token, no new CSS class.

**Rationale.** The operating rules forbid substituting `0` for "unknown" because it invents a measurement. Passing `null` through reuses the codebase's own convention and requires no new rendering vocabulary.

**Consequence to handle.** `upload-queue-integrity` requires remaining time to be *labelled as an estimate* when it is computed. The bare `Format.duration` output does not carry that qualifier, so the call sites need a small amount of surrounding text — not a change to `Format`.

### D7 - Fix well-formedness at the source, not with a click handler

`uploads.html:273-293` nests `<label class="dest-opt">` around `<label class="switch">`. The HTML parser implicitly closes the outer label when it encounters the inner one, so the visible option text falls outside any label and stops being a click target.

**Decision.** Rewrite the three toggles as a single `<label>` wrapping the input and its visual track, with the visible text as a sibling inside that one label. Add no JavaScript to compensate.

**Alternatives considered.**
- *Add a click handler on the text.* Rejected: it papers over invalid markup, leaves the accessible name wrong, and leaves every future copy-paste of this pattern broken.
- *Use `aria-labelledby` to paper over it.* Rejected: same objection; the structure stays wrong for the next author.

### D8 - Restore mobile parity by removing the hide rule, not by adding exceptions

`uploads.css:763` — `@media (max-width: 560px) { .qi-actions .btn-icon:not(.keep-mobile) { display: none; } }`. Cancel is not `.keep-mobile`, so below 560px an in-flight transfer cannot be cancelled and a completed row has no control at all.

**Decision.** Delete the blanket hide rule. Below 560px, keep every action visible and reduce density by other means if needed — the row already wraps (`:751`), and `.qi-actions` (`:456`) is the last flex child.

**Rationale.** `upload-page-accessibility` requires every row state to be resolvable at every viewport. Adding `.keep-mobile` to Cancel would satisfy the cancel case but leave the completed and queued rows with no control, failing the same requirement.

### D9 - Never serialise a stack trace; a disclosure opt-in is not wanted

> **Superseded by concurrent work in the working tree.** When this decision was first written, `errorHandler.js:20` gated the `stack` field on `config.env === 'development'`, which `env.js:9` makes the *default* — so a stack leaked on every error in every documented start path. During authoring, `src/middlewares/errorHandler.js` was modified in the working tree (uncommitted, by work outside this change) to **remove the `stack` field entirely**, forward `AppError` messages verbatim, replace every non-`AppError` message with a generic string in *all* environments, and log `err.stack` server-side only. That is stricter and better than what was planned here, so this decision has been rewritten to match the tree rather than to re-litigate it.

**Decision.** Do **not** introduce a disclosure opt-in. A stack trace has no legitimate consumer in a browser, and this application ships with **no authentication** — an explicit non-goal of this repository — so there is no trusted-console case to protect. The stack belongs in the server log, which the working-tree change already does.

**Revised decision.** Treat the working-tree change as a **pre-existing condition to pin, not work to redo.** This change's remaining responsibility is narrow:

1. Pin the behaviour with an automated test so it cannot regress (`tasks.md` 2.1).
2. Verify the *message-forwarding* rule that replaced the old condition. The old rule sanitised **only** `statusCode === 500` **and only** when `env === 'production'`, so a `400` in production leaked its message and any non-`AppError` `400` leaked a raw system message containing an absolute path. The new rule closes both. This is the part of the finding the working tree fixes as a side effect and is worth asserting explicitly.
3. Document the contract in `docs/CONTRACTS.md`. **Do not edit `errorHandler.js` or `env.js`.**

**Alternatives considered.**
- *Positive `DEBUG` opt-in gating the `stack` field* (the original decision). **Rejected — superseded.** Strictly weaker: it preserves a code path that discloses server internals to an unauthenticated client, and the diagnostic value does not justify it on this codebase's posture.
- *Default `NODE_ENV` to `production`.* Rejected: it silently changes `config.env` for every other consumer, and an unset variable meaning "production" is its own footgun.
- *Keep `stack` but default `NODE_ENV` to production.* Rejected: same objection, and weaker than removing the field.

**Scope note.** `errorHandler.js` and `env.js` are shared, so the working-tree change affects every endpoint, not only upload. Both are listed as *untouched* by `files-page-correctness`, so there is no ownership conflict — **but that also means the change is not this change's to claim.** `proposal.md` → Impact no longer lists either file, and `tasks.md` phase 2 no longer edits them.

### D10 - No new endpoints, and now no shared-file edits either

D5 resolves the recent-uploads strip through an endpoint that already exists. Destination creation uses `POST /api/fs/folder`, which already exists. Failure kinds require no new endpoint — only new fields on the existing upload error body, owned by D1's sibling change. Destination validation before transfer uses `GET /api/fs/tree` and `GET /api/fs/list`, both of which already exist.

**Decision.** This change adds **no route, no controller, and no service**. With D9 superseded, its server footprint reduces further to **the deletion of a duplicated catch-all in `server.js` and nothing else** — a single deleted block at `server.js:41-48`.

**Why this matters.** Three changes are in flight against this repository. Reducing this change's server footprint to one deleted duplicate keeps the merge surface with `dashboard-real-data` (109/112 complete) and `files-page-correctness` as small as the work allows.

**Why this matters.** It keeps the merge surface with two other in-flight changes as small as possible.

### D11 - Test the page's exported derivations, not its DOM

No DOM harness exists and none may be added (`test/frontend/app.test.js:9-16`). `uploads.js` returns only `{ init }`, so nothing is reachable today.

**Decision.**
- `uploads.js` gains a test-only-compatible export surface on its returned object — the derivations from D2, the preset table, and the option defaults — following the precedent `app.js:1046-1050` already sets for `window.AFM`. These are legitimate module surface, not a test backdoor.
- The test file `require()`s `uploads.js` after stubbing `globalThis.window`, `globalThis.document`, and `globalThis.XMLHttpRequest`, mirroring `app.test.js:27-29`.
- `renderItemHTML` stays testable for free: it returns a **string** (`:506-522`), so an escaping assertion is a string assertion with no DOM stub at all.

**Rationale.** Every `upload-markup-escaping` and `upload-surface-honesty` requirement is assertable this way. The `NaN` and `0s left` defects are assertable because D2 extracted them into pure functions.

**Limit, stated honestly.** Requirements that are inherently DOM- or layout-level — focus order, actual announcement by a screen reader, pixel layout at 320px, whether the parsed `<label>` structure behaves as specified in the target engines — are **not** covered by this suite. They are covered by the source-level structural checks in D7 and D8 and by browser verification in `tasks.md` §9. The suite is not claimed to cover them.

### D12 - Scope test discovery to the test directory

`npm test` is `node --test`, which discovers test files anywhere under the project root. During this investigation a scratch probe left in a temporary directory was auto-discovered and made the suite exit `1` — an eight-failure cascade from a file that was never meant to be a test. `files-page-correctness` independently identified the same hazard.

**Decision.** Scope the test script to the test directory (`node --test test/`), and record the change in `tasks.md` as a **coordination item with `files-page-correctness`**, which has also claimed `package.json`. Two changes editing one line of `package.json` will conflict.

**Alternative considered.** Add a `temp/` or scratch directory to `.gitignore`. Rejected as insufficient — discovery would still break the run; scoping the glob is the actual fix. The `.gitignore` entry is still worth having, and `files-page-correctness` has claimed it too.

---

## Risks / Trade-offs

**[R1] The upload placement contract may still be unimplemented when this change begins.** → Mitigation: §0 is a hard gate with an explicit verification command and an escalation path (D1). No frontend task may begin on a false premise. Recorded as a dependency, not absorbed.

**[R2] Two in-flight changes will edit `server.js` and `package.json`.** → Mitigation: this change's `server.js` edit is a deletion of the duplicated `/api` catch-all (`:41-48`) and nothing else; its `package.json` edit is the test script and nothing else. Both are called out in `tasks.md` as single-writer coordination points. `uploads.html` is shared with `files-page-correctness` for sidebar entries — this change must not edit the sidebar block.

**[R3] `api.js` is listed as untouched, yet D4 edits it.** → Mitigation: the edit is additive to the error object `upload()` already constructs, touches no download helper, and is called out in `tasks.md` §3 with its own verification. If the reviewer prefers strict non-modification, the fallback is for `uploads.js` to read the kind from a raw response handle — strictly worse, since `API.upload` does not expose one.

**[R4] Extracting derivations touches most of `uploads.js`, raising regression risk in a file with no tests.** → Mitigation: D2's extractions are behaviour-preserving by construction — each pure function returns exactly what the inline expression returned, including the current defects. The defects are then fixed *in the extracted function*, one at a time, each with a failing-then-passing check. The file is sequenced so phases touching it are strictly serial.

**[R5] The recent-uploads strip loses its size figure.** → Mitigation: accepted deliberately (D5). Showing a size the activity record does not contain would be a fabrication. Alternative of resolving sizes per folder adds an N-request fan-out on page load and is rejected.

**[R6] Removing claims may read to a stakeholder as removing features.** → Mitigation: this is the point. `upload-surface-honesty` is explicit that the alternative — leaving a claim whose capability does not exist — is not acceptable. `tasks.md` §7 requires the claim inventory in `docs/CONTRACTS.md` so the removals are visible and reversible if a capability is later built.

**[R7] D12's test-script scoping could hide a legitimate test placed elsewhere.** → Mitigation: all suites live under `test/`, mirroring `src/`. The scope change is verified by running the full suite and confirming the same test count.

**[R8] Browser-level requirements are not machine-verified.** → Mitigation: stated as a limit in D11 rather than papered over. `tasks.md` §9 requires a manual browser pass at 320/560/768/1024/1440 with keyboard-only traversal, recorded in the change before completion.

---

## Migration Plan

No data migration. No schema change. No new dependency.

**Ordering.** §0 gate → §1 escaping (independently shippable, lowest risk, closes a real vulnerability) → §2 honesty and copy → §3 error disclosure → §4 queue derivations and rendering cost → §5 destination selection → §6 accessibility → §7 documentation → §8 integration → §9 browser verification.

**Rollback.** Each phase is a self-contained diff. Phases 1–3 touch disjoint concerns and can be reverted independently. Phase 4 is the largest single diff and is sequenced so the extraction commits precede the defect-fix commits, making a partial revert safe.

**Compatibility.** The client-visible upload request gains no new required field from this change. The upload **error** body gains two optional fields — a machine-readable kind and a more specific status for two failure classes — both produced by the sibling change. A client that ignores unknown fields is unaffected; the Upload page is the only consumer of the kind. The working-tree `errorHandler.js` change alters the `error` string for non-`AppError` failures — those now read `"Request could not be processed."` rather than a raw system message. That is a behaviour change for any consumer keying off the message text, and no consumer in this repository does; the Upload page reads the new `kind` field instead.

**Ordering caveat.** Because `src/middlewares/errorHandler.js` was changed in the working tree during authoring and is **uncommitted**, phase 2's verification tasks must be run against whatever that file contains at execution time. If it has been reverted, phase 2 must not reintroduce a `DEBUG` opt-in — it should re-apply the removal of the `stack` field and the `AppError`-only message forwarding, because that is the contract `upload-error-disclosure` specifies.

**Verification environment.** All reproduced findings were measured on Node v24.15.0 / win32 x64 against a temporary storage root. Linux was not exercised. The changes here are client-side plus one additive server conditional, so the platform surface is small, but §8 requires the suite to pass on the verification platform and the result recorded.
