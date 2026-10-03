# Proposal

## Why

The Upload page (`public/uploads.html`, `public/assets/js/uploads.js`, `public/assets/css/uploads.css`) is the only page whose entire purpose is to write user data to disk, and it is the only page with **zero automated test coverage**. `npm test` reports 287 tests covering services, the dashboard API, `app.js`, and a live-server suite — **not one of them exercises `POST /api/fs/upload`** or any code in `uploads.js`.

An investigation of the page found **28 defects**, verified against a live Express server on Node v24.15.0 / win32 x64 with a temporary `STORAGE_ROOT`. Six are data-integrity or security defects; the remainder are fabricated state, dishonest copy, and structural inaccessibility.

### The four reproduced data-loss defects

**1. The chosen destination is silently ignored — every file lands in the storage root.** `uploads.js:228-232` appends the `file` part **before** the `destination` part. Multer's `diskStorage.destination` callback (`fs.controller.js:332-342`) reads `req.body.destination` at the instant the first file chunk arrives, when only the `file` field has been parsed; the value is `undefined`, so the destination falls back to `'/'`. Reproduced:

```
order=file,destination  -> HTTP 201 {"path":"/target/p1.txt"}
   on disk: p1.txt                  <-- storage ROOT, not /target
order=destination,file  -> HTTP 201
   on disk: target/p1.txt           <-- correct
```

`uploadFile` (`fs.controller.js:370-371`) computes the response path **after** multer completes, when the field *is* populated — so the response asserts a location the file is not at. `MetadataService.addActivity` (`fs.controller.js:374-380`) records `folder: "/target"` for a file sitting at `/`, propagating the error into the activity feed. The `Invalid upload destination` branch (`fs.controller.js:339-341`) is unreachable for browser uploads: `destination=/does/not/exist` returns **201**.

**2. `overwrite` is a no-op, so a duplicate silently destroys the existing file.** Reproduced: `dup.txt` containing `ORIGINAL-CONTENT`, uploaded with `overwrite=false`, is `REPLACED` on disk and the response is `201`. The toggle is **off by default** (`uploads.js:24`), so the destructive path is the default path. `fs.controller.js:346` carries an explicit `// Optional: Add logic here` TODO admitting the omission.

**3. `preservePath` is a no-op; folder uploads flatten and collide.** Reproduced: `myfolder/sub/deep.txt` returns `201` and is stored as `/deep.txt`. Busboy strips directory components from `originalname`, so `validateFileName` never sees a separator and cannot reject anything. Two files named `report.pdf` in different subfolders overwrite one another, silently, per defect 2. The page promises the opposite in three places: `uploads.html:218`, the "Preserve folder structure" toggle at `:287-293`, and the queue empty state at `uploads.js:435`.

**4. There is no server-side size limit.** Reproduced: a 12 MB upload is accepted and 12,582,912 bytes are written. `multer({ storage })` (`fs.controller.js:354`) declares no `limits`. The advertised 5 GB cap exists only in the browser (`uploads.js:157`); any other client is unbounded.

### The two security defects

**5. Stack traces are returned to clients by default.** Reproduced: `{"success":false,"error":"Name contains invalid characters.","stack":"Error: ... at fs.controller.js:363 ..."}`. `errorHandler.js:20` gates on `config.env === 'development'`, and `env.js:9` defaults `NODE_ENV` to `'development'`. Neither `npm run dev` nor `npm start` sets `NODE_ENV`, so a default deployment leaks internal paths and stack frames on every error.

**6. `app.use(cors())` reflects any origin on a mutating endpoint.** Reproduced: an `OPTIONS` preflight carrying `Origin: https://evil.example` returns `204` with `Access-Control-Allow-Origin: *` and `Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`. The server has no authentication, so any web page a user visits can write into the storage root — bounded only by whatever the OS user can write.

### Reflected DOM XSS in the queue

`renderItemHTML` interpolates `item.name` (`uploads.js:511`) and `item.error` (`:485`) into `innerHTML` with no escaping. `escapeHtml` is exported from `app.js:1049` and used at 15 sites in `dashboard.js` — and **zero times in `uploads.js`**. A local file named `<img src=x onerror=…>.txt` executes on render, *before* the server's `validateFileName` ever sees it.

### Fabricated state and copy the backend does not implement

`renderRecent()` (`uploads.js:729-737`) hardcodes seven invented files with invented sizes and `Date.now()`-relative timestamps, rendered under the heading *"Recently uploaded"* / *"Latest completed transfers · from all admins"* (`uploads.html:355`). Real data already exists: `MetadataService.addActivity` records every upload as `{type:'upload', user, action, target, folder, time}` and `getActivities` (`MetadataService.js:157-167`) reads it back, exposed today through `GET /api/dashboard/summary`. Nine further claims in `uploads.html` and `uploads.js` describe capabilities with no implementation: checksum verification, CDN distribution across "42 edge points-of-presence", "Auto-encrypted in transit", "Auto-retry on failure", "Uploads resume automatically after network interruptions", "resume from the last checkpoint", "save up to 40% space", "Compress & deduplicate", and "Client-side encryption enabled". `AGENTS.md` names fabricating a value to fill a UI slot as a red line.

The presets are equally inert: selecting one only mutates `state.concurrency` and `state.options.compress` (`uploads.js:712-714`), and `compress` is never transmitted — `processUpload` sends only `destination`, `overwrite`, and `preservePath` (`uploads.js:230-232`).

### Honesty defects in the numbers

Per-item ETA renders **`0s left`** when speed is zero (`uploads.js:457,546` → `Format.duration(0)`), displaying a confident wrong number where the truth is *unknown*. The "Uploaded today" and "Data transferred" tiles are derived from the **current queue** (`uploads.js:638-641`), not from any time scope, so `clearCompleted()` (`:349-353`) resets both to zero — a user tidying the list erases the session's transfer record, and the word "today" is unsupported by any data source. `updateItemProgress:539` divides by `item.size` with no zero guard (unlike `:450`), so an accepted 0-byte file renders `NaN%`.

### Functional and structural defects

"Drop files anywhere on this page" is promised at `uploads.js:435` and `uploads.html:190`, but the window-level `drop` handler (`uploads.js:146`) only clears the highlight and **adds nothing** — dropping outside the dropzone discards files with no toast and no feedback. The dropzone is `role="button" tabindex="0"` (`uploads.html:210`) with **no `keydown` handler**, so it is keyboard-dead (WCAG 2.1.1). The three option toggles are built from **nested `<label>` elements** (`uploads.html:273-293`), which is invalid HTML; the parser auto-closes the outer label, so the visible text is not a click target. Queue action buttons are icon-only with `data-tip` and no `aria-label`, and `[data-tip]` fires on `:hover` only (`components.css:1102`), with no `:focus-visible`. No `aria-live` region exists on `#uploadMetrics`, `#queueStats`, `#queueGlobal`, or `#queueList`. Under 560px, `uploads.css:763` hides every `.btn-icon:not(.keep-mobile)` — and Cancel is not marked `keep-mobile`, so **on a phone a user cannot cancel an in-flight upload**, cannot remove failed or queued rows, and a completed row shows no control at all.

`renderQueueItem` calls `bindQueueActions()`, which re-binds *every* `[data-act]` node in the queue (`uploads.js:533,554`) — O(n) per single-row update. `renderMetrics` rewrites the full `innerHTML` of all four tiles plus a 20-bar sparkline once per second (`:297,630-683`), destroying and recreating DOM for the life of the session.

## What Changes

- Replace the untrusted `item.name` / `item.error` interpolation with `escapeHtml` at every insertion point in `uploads.js`.
- Make per-item ETA and per-item remaining time render **unavailable** rather than `0s` when speed is zero, and guard `updateItemProgress` against a zero-byte file.
- Re-derive the metric tiles from a source that survives `clearCompleted()`, and **rename the labels to what is actually measured** unless a real time-scoped source is introduced.
- Exclude failed items from the global progress numerator, and surface the failed count beside the bar so a stalled percentage is explained.
- Replace whole-`innerHTML` re-renders of the metric tiles with per-field text updates; replace per-row listener re-binding with one delegated listener on `#queueList`.
- Make the page-wide drop either work (route to `addFiles`) or stop being promised in two places; add `keydown` activation to the dropzone.
- Replace the nested `<label>` toggles with valid single-label markup; add `aria-label` to every icon-only queue button; add `:focus-visible` tooltip support; add `aria-live` to the stats, progress, and queue regions.
- Restore the Cancel affordance at narrow widths so the queue is fully operable on a phone.
- Replace the free-text destination prompt with real folder selection, validate the destination before the first upload, offer destination creation via the existing `POST /api/fs/folder`, and remove the hardcoded `/releases/2025` placeholder.
- Wire "Recently uploaded" to real recorded activity, or **delete the section** — the fabricated feed is not retained in any form.
- Delete every unimplemented capability claim; gate any retained claim behind a capability flag read from the server.
- Make presets honest: transmit what they claim or remove what they cannot deliver.
- Make the page's error consumption typed: read the machine-readable failure kind the server supplies instead of parsing prose, and fall back honestly on an unrecognised kind.
- Stop returning stack traces by default. *(Partially resolved in the working tree during authoring — see below.)*

### Partially resolved in the working tree during authoring

After the findings above were recorded, `src/middlewares/errorHandler.js` was modified in the working tree by work outside this change. It now **removes the `stack` field entirely**, forwards `AppError` messages verbatim, replaces every non-`AppError` message with a fixed generic string in all environments, and logs `err.stack` server-side only. That closes finding 5 more thoroughly than originally planned — it also closes the related gap that a `400` in production was never sanitised, because the old condition required `statusCode === 500` *and* `env === 'production'`.

This change therefore **does not edit `src/middlewares/errorHandler.js` or `src/config/env.js`.** Its residual responsibility is to pin the corrected behaviour with an automated test and to document it. Because that working-tree edit is uncommitted, `tasks.md` phase 2 carries an explicit instruction for the case where it has been reverted.

### Relationship to the in-flight `files-page-correctness` change

That change independently found the **same** multipart field-ordering defect from the Files page and has already claimed a capability named `upload-destination-integrity` covering *field ordering, truthful response paths, overwrite policy, size limits, abort, per-file errors, and folder drops* — defects 1–4 above.

**This change therefore does not re-specify or re-implement those server-side behaviours.** They are consumed as a precondition. `tasks.md` opens with a verification gate (§0) that proves the server contract before any frontend task depends on it, and that gate escalates rather than silently duplicating the work if the sibling change has not landed. CORS (`server.js:19`) and CSP (`server.js:16-18`) are likewise escalated by that change and are recorded here as a dependency, not re-specified.

The stack-trace disclosure defect is **not** claimed by that change — its *Untouched* list names both `src/middlewares/errorHandler.js` and `src/config/env.js` — so it is in scope here.

### Preserved, not changed

- The layered flow `routes → controllers → services → fs` (`AGENTS.md` rule 1) and the `PathService` boundary (rule 2). This change adds no service and bypasses no boundary.
- The response-envelope convention (rule 6): `POST /api/fs/upload` keeps `{success, data}`; no endpoint is added or removed.
- `MetadataService` fire-and-forget semantics (rule 7). The `addActivity` call at `fs.controller.js:374-380` stays fire-and-forget.
- `public/assets/js/api.js` is **not modified**. Its `upload()` helper already returns `{promise, abort}` and is the correct seam.
- Zero new runtime dependencies.

## Capabilities

`openspec list --specs` reports no specs, so this repository has no existing capability inventory and every capability below is introduced new. `openspec/changes/files-page-correctness` is also in flight; its capability names are avoided here to prevent a near-duplicate path collision.

### New Capabilities

- `upload-queue-integrity`: the queue state machine; progress, percentage, and remaining-time arithmetic; zero-byte safety; the derivation and labelling of the metric tiles; global-progress semantics under failure; per-file error taxonomy and retry semantics; and the rendering-cost requirements that keep a large queue responsive.
- `upload-destination-selection`: selection of the upload destination through real folder choices rather than unvalidated free text; pre-flight validation; optional destination creation via the existing folder endpoint; and the truthfulness of the displayed destination.
- `upload-page-interaction`: dropzone operability by keyboard and pointer; the page-wide drop contract; drag-highlight correctness across child elements; and the requirement that every visible option toggle reaches the server.
- `upload-page-accessibility`: accessible names for icon-only controls, keyboard-reachable tooltips, live-region announcement of upload state, valid ARIA on the dropzone, and parity of queue controls at narrow viewports.
- `upload-surface-honesty`: removal of the fabricated recent-uploads feed and of every capability claim the server does not implement; honest preset semantics; and label text that matches the measurement.
- `upload-markup-escaping`: escaping of every filesystem-, metadata-, and error-derived string before markup insertion in the upload page.
- `upload-error-disclosure`: permanent suppression of stack traces and internal paths from error responses, with no configuration that re-enables disclosure.
- `upload-regression-coverage`: the automated coverage required to keep every defect in this change from returning.

### Modified Capabilities

None.

## Impact

**New files**
- `test/frontend/uploads.test.js`
- `test/api/upload.surface.test.js` — error-disclosure assertions only; upload *placement* assertions are owned by `files-page-correctness`
- `docs/decisions/ADR-004-upload-page-integrity.md`

**Modified files**
- `public/assets/js/uploads.js` — the large majority of this change
- `public/uploads.html`
- `public/assets/css/uploads.css`
- `public/assets/css/components.css` — `[data-tip]:focus-visible` only
- `public/assets/js/api.js` — attaches the server's failure kind to the error `upload()` already constructs (additive; see `design.md` D4, R3)
- `server.js` — remove the duplicated `/api` catch-all (`server.js:41-48`) and nothing else
- `package.json` — scope the test script to `test/` (single writer; also claimed by `files-page-correctness`)
- `AGENTS.md`, `docs/CONTRACTS.md`, `docs/REPO_MAP.md`

**Untouched:** `src/controllers/fs.controller.js` and `src/routes/fs.routes.js` (both owned by `files-page-correctness`), `src/services/*`, `src/utils/validators.js`, `src/middlewares/errorHandler.js` and `src/config/env.js` (already corrected in the working tree — see *Partially resolved*), `public/assets/js/files.js`, `public/files.html`.

**Merge-conflict hotspots:** `uploads.js` is written across six sequential phases — phases touching it are strictly sequential. `server.js` is shared with `dashboard-real-data` (109/112 tasks complete) and `files-page-correctness`; the only edit here is deleting the duplicate catch-all. `uploads.html` is touched by `files-page-correctness` for sidebar entries only; the sidebar block must not be edited here.

**Cross-platform:** Windows and Linux, field-for-field identical behaviour. Note `stats.size` for a directory is `0` on NTFS and block-sized on ext4, which is why directory figures are never rendered as bytes.

**Non-goals** are enumerated in `design.md`.

## Acceptance Criteria

Each criterion is independently verifiable without reading this conversation. Confirmed defects are marked **[reproduced]**.

### Data integrity and truthfulness

- [ ] **[reproduced]** An upload whose `destination` is a non-root folder places the file in that folder **on disk**, asserted by inspecting the filesystem and not by reading the response body.
- [ ] **[reproduced]** The upload response `data.path` equals the path the file was actually written to, for every destination including the root.
- [ ] **[reproduced]** Uploading over an existing file with the overwrite option **off** does not modify the existing bytes, and the response reports the collision rather than success.
- [ ] **[reproduced]** A folder-structured upload produces the corresponding directory tree, and two same-named files in different subfolders both survive.
- [ ] An upload exceeding the advertised maximum is rejected by the **server**, not only by the browser.
- [ ] No error response body contains a `stack` field, an absolute filesystem path, or an internal frame reference, in any environment and under any configuration.

### Queue correctness

- [ ] A zero-byte file never renders `NaN`, `Infinity`, or a negative width in the progress bar or percentage label.
- [ ] Remaining time renders as unavailable — never `0s`, never a bare number — whenever measured speed is zero.
- [ ] The global progress bar is computed only from items that are uploading or complete, so a failure cannot leave it permanently below 100% without an accompanying explanation of what failed.
- [ ] The completed-count and transferred-bytes tiles do not reset when completed rows are cleared from the queue.
- [ ] Every tile label describes the quantity actually displayed; no tile claims a time scope that no data source provides.
- [ ] A failed upload's row distinguishes the failure kind (rejected name, collision, too large, network) rather than rendering one undifferentiated string.
- [ ] Retrying a failed item resets its transferred bytes to zero and re-enters the queue exactly once.
- [ ] Selecting a preset changes the observable concurrency, and every other effect the preset advertises is either transmitted to the server or removed from the preset.

### Interaction and accessibility

- [ ] The dropzone can be activated by <kbd>Enter</kbd> and <kbd>Space</kbd>, and the file picker opens.
- [ ] Dropping a file on any part of the page either adds it to the queue with visible confirmation, or the page contains no text claiming that it does.
- [ ] Drag highlighting does not clear while the pointer moves between child elements of the dropzone.
- [ ] Every option toggle is a single valid label associated with its input, and clicking the visible text toggles it.
- [ ] Every icon-only queue control has an accessible name, and its tooltip is reachable by keyboard focus.
- [ ] Upload state changes are announced through a live region.
- [ ] The dropzone exposes valid ARIA — it is not a `role="button"` container holding focusable controls.
- [ ] At 320px and at 560px, an in-flight upload can be cancelled, and completed, failed, and queued rows can each be removed.

### Honesty

- [ ] No fabricated file list, size, or timestamp is rendered anywhere on the page.
- [ ] "Recently uploaded" is either populated from recorded server activity or absent from the page; a hardcoded array is not an acceptable implementation of either.
- [ ] No copy on the page claims checksum verification, CDN distribution, encryption, automatic retry, transfer resumption, compression, deduplication, a byte-saving percentage, or a multi-admin scope, unless a server-sourced capability flag enables that exact claim.
- [ ] The displayed destination is the real current destination; no placeholder path is shown before the first render.

### Security

- [ ] No filename, server error message, or destination string is inserted into markup unescaped in `uploads.js`; a file named with markup-significant characters renders as text.
- [ ] With no configuration of any kind, an upload error response contains neither a `stack` field nor an absolute path, and there is no setting whose purpose is to disclose one.
- [ ] A failure not anticipated by a handler discloses a fixed generic message in every environment, including when it carries a client-error status.

### Guardrails

- [ ] `test/frontend/uploads.test.js` exists and covers every defect above observable without a browser.
- [ ] `test/api/upload.surface.test.js` pins the error-disclosure behaviour.
- [ ] `npm test` exits `0`, and no test is discovered outside `test/`.
- [ ] `AGENTS.md` and `docs/CONTRACTS.md` reflect the shipped behaviour.
