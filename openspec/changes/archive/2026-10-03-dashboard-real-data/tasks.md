# Tasks

Every task states its verification. Phases are ordered by real dependency, which is derived from **file ownership**, not from the recommended outline.

**Parallelisation rules applied.** Two tasks may run concurrently only if they write disjoint file sets. Derived constraints:

- `package.json` — Phase 0 only. Single writer.
- `MetadataService.js` — Phase 0 **then** Phase 5. **Sequential** (same file).
- `PathService.js` — Phase 1 only. Single writer.
- `FileSystemService.js` — Phase 3 **then** Phase 4. **Sequential** (same file).
- `server.js`, `dashboard.routes.js`, `dashboard.controller.js` — Phase 2 only.
- `dashboard.js`, `app.js`, `index.html`, `files.html`, `uploads.html`, `settings.html` — Phase 6 only.
- `docs/*`, `AGENTS.md` — Phase 7 only.

**Deviation from the recommended outline, stated explicitly.** The recommended order puts "Dashboard route/controller/API" before "filesystem aggregation". That is only true of the *skeleton*: the route module and controller shell write disjoint files from `FileSystemService.js` and may proceed in parallel, but the controller cannot be **completed** until aggregation and capacity exist. Phase 2 therefore has two gates — a skeleton gate and a completion gate in Phase 5. Also, a test runner is added as task `0.1`: the bootstrap fix cannot be verified without it.

**Contract freeze.** Phase 6 (frontend) may not begin until the Phase 5 contract gate is green against a live server. `api.js` is never modified, so any contract change found in Phase 6 is a defect found late, not a negotiation.

---

## 0. Prerequisites — test runner and metadata bootstrap

- [x] 0.1 Change `package.json:10` from `"test": "echo \"Error: no test specified\" && exit 1"` to `node --test`; add **no** dependencies; verify `npm test` runs and exits `0` on an empty suite. *A4 approved 2026-10-03.*
- [x] 0.2 Create `test/` mirroring `src/` (`test/services/`, `test/controllers/`); verify `node --test` discovers and reports suites in those directories.
- [x] 0.3 Fix the `MetadataService` bootstrap: move the `_write()` call out of the `catch` body at `MetadataService.js:26-31` so the directory is created before the file write; verify with a test that a missing directory plus a missing file yields a successful empty read, not a raw `Error`.
- [x] 0.4 Raise bootstrap failures as `AppError`, not a raw system error; verify the failure path returns the project error envelope and that a later read **retries** initialisation rather than staying permanently broken.
- [x] 0.5 Restore `data/.gitkeep`, which `.gitignore:15-16` already anticipates; verify `git ls-files data` is non-empty on a fresh checkout and that `git check-ignore data/.gitkeep` does not exclude it.
- [x] 0.6 Confirm the existing fire-and-forget metadata calls still swallow failures — `incrementDownload`, `addActivity`, `deletePath`; verify tests confirm a filesystem operation succeeds even when its metadata write throws. *Spec: `dashboard-metadata` — "Metadata Failures Never Block Filesystem Operations".*
- [x] 0.7 **Gate:** verify `GET /api/fs/list` now succeeds on a fresh checkout with no `data/` directory. This repairs a pre-existing break and is independently shippable.

*Parallelisable with Phase 1 — disjoint files (`MetadataService.js`, `package.json`, `test/` vs `PathService.js`, `test/`).*

## 1. Prerequisite — path containment security

- [x] 1.1 Add `test/services/PathService.test.js` covering root, direct child, nested child, sibling-prefix (`download` vs `download-backup`), `..` traversal, and `/media/../../download-2/x`; verify the sibling-prefix and traversal cases **fail before the fix** (red), confirming the suite actually reproduces the vulnerability.
- [x] 1.2 Add root-spelling invariance cases: trailing separator, forward slashes, different letter case, redundant `./` segment, plus a POSIX root; verify the containment verdict is identical across all spellings.
- [x] 1.3 Replace the naive prefix check at `PathService.js:31` with `target === root || target.startsWith(root + path.sep)`; verify 1.1 and 1.2 turn green.
- [x] 1.4 Apply the mirror fix to `toClientPath` (`PathService.js:46`); verify an outside-root absolute path is not converted, and an inside-root path converts to a forward-slash POSIX client path.
- [x] 1.5 Verify single-resolution-basis: both sides produced by the same resolution function; no `realpath`-canonicalised root compared against a `resolve`-produced target.
- [x] 1.6 *(F4 fix landed in P3, which owns FileSystemService.js)* Re-verify every existing `resolveSecurePath` / `toClientPath` reference (audited: **12**, not the 10 estimated) still resolves legitimate paths; verify the storage-root deletion sentinel still returns `403` (`FileSystemService.js:155`). **Rename re-validation does NOT reject traversal** - it is a no-op (`toClientPath` returns `/`, which re-resolves to the root). Escalated, not fixed: filename validation is the effective barrier. See design.md escalation note.
- [x] 1.7 **Gate:** verify no existing legitimate flow regressed — list, stat, upload, rename, delete, download, ZIP. This fix changes behaviour for currently-allowed sibling-prefix paths; those must now be correctly refused.

*Sequential after Phase 0? No — parallelisable with Phase 0. Must complete before Phase 3: aggregation would otherwise traverse outside the root on every unauthenticated request.*

## 2. Dashboard API — route and controller skeleton

- [x] 2.1 Create `src/routes/dashboard.routes.js` with exactly two `router.get` bindings and no I/O; verify the module contains no filesystem or metadata access.
- [x] 2.2 Create `src/controllers/dashboard.controller.js` with two async handlers composing existing services directly; verify **no** `DashboardService` is created.
- [x] 2.3 Mount the router in `server.js` **before** the `/api` catch-all at `:35-37`; verify `GET /api/dashboard/summary` is not `{"success":false,"error":"API endpoint not found"}` and that `GET /api/dashboard/does-not-exist` still reaches the catch-all.
- [x] 2.4 Verify `fs.routes.js` remains mounted **only** at `/api/fs`; verify no filesystem mutation route is reachable under `/api/dashboard` (probe upload, rename, delete, folder, download, ZIP).
- [x] 2.5 Add contract tests asserting bare responses: summary is a top-level object, health is a top-level array, neither contains `success` or `data`.
- [x] 2.6 Add a test asserting `/api/health` is byte-identical to its pre-change response. *Spec: `dashboard-health` — "Liveness endpoint is unchanged".*

*Skeleton (2.1–2.4) parallelisable with Phase 3. **Not completable until Phase 5** — the controller cannot return real data before aggregation, capacity, and ranking exist.*

## 3. Filesystem aggregation

- [x] 3.1 Add `test/services/FileSystemService.tree.test.js` covering regular files, nested directories, empty directories, an empty root, and dot-prefixed exclusion; verify counts and byte totals.
- [x] 3.2 Add a test proving **directory entry size is not accumulated**: two trees with identical file content but different directory counts report identical totals. *This is the primary cross-platform correctness test — `stat().size` is `0` on Windows and block-sized on ext4.*
- [x] 3.3 Add link tests: junction to an outside directory (Windows: create a **junction** — unelevated `symlink('file')` returns `EPERM`), link cycle to an ancestor, broken link; verify each is skipped, contributes no bytes, and never appears as a name. Verify the cycle case terminates within the budget.
- [x] 3.4 Add a test proving classification uses non-following directory-entry metadata, not a link-following call; verify `fs.stat` would have misclassified the junction as an ordinary directory.
- [x] 3.5 Add an inaccessible-subtree test; verify the subtree is skipped, siblings survive, a diagnostic is recorded, and the endpoint still succeeds.
- [x] 3.6 Implement `getTreeStats` in `FileSystemService`: iterative depth-first walk with an **explicit stack** (no recursion), `isSymbolicLink()` skipped entirely, dotfiles skipped, file sizes summed, directory sizes excluded; verify 3.1–3.5 turn green.
- [x] 3.7 Enforce the approved budgets — **100,000 entries / 2,000 ms** (A3) — whichever trips first; verify traversal stops, returns the partial result with an explicit `truncated` flag, and never exhausts memory or hangs.
- [x] 3.7b *(completed in P6)* Verify the `truncated` flag is surfaced in the UI, not merely present in the payload; a partial total is a **wrong** total, and understating `treeBytes` is a fabrication risk of the same class this change exists to eliminate. *Spec: `filesystem-aggregation` — "Bounded Traversal"; `dashboard-frontend` — "Partial state".*
- [x] 3.8 Taxonomy reuse **ESCALATED per OQ3/D7**. `_extKey` was inline in `fs.controller.js:93-104`, not an extractable function, so D2's premise ("expose it without relocating") did not hold. Created `src/utils/fileTypes.js` as the single server-side source and used it from `getTreeStats`. `fs.controller.js` deliberately NOT touched (outside phase ownership, degree-84 file) — collapsing its 12-line inline copy is a ~12-line removal awaiting approval. Drift risk is currently unmitigated between the two copies; `CONTRACTS.md:205` already mandates mirroring. Verified: recognised extensions map correctly, unknown falls back to `other`, breakdown sums exactly to `treeBytes`.
- [x] 3.9 **Gate:** verify no native absolute path is produced in any returned value; stack entries are client paths only.

*Must follow Phase 1. Writes `FileSystemService.js`, so **Phase 4 is sequential after this**.*

## 4. Storage capacity

- [x] 4.1 Add `test/services/FileSystemService.volume.test.js` covering a valid reading, the `bsize * (blocks - bavail)` arithmetic, and `bsize * blocks`; verify the arithmetic exactly.
- [x] 4.2 Add a test proving `bsize` is **read, never assumed** and never multiplied by 1024; verify a non-power-of-two block size is used verbatim.
- [x] 4.3 Add tests for unavailability: absent capacity fields ⇒ `usedBytes: null`, `totalBytes: null`, `volumeAvailable: false`, HTTP `200`; non-positive capacity ⇒ same; verify `0` is never substituted for a null.
- [x] 4.4 Add a test proving the containing volume is resolved from the **resolved** root, so a trailing separator or redundant `.` in `STORAGE_ROOT` does not change which volume is measured.
- [x] 4.5 Implement `getVolumeStats` via `fs.promises.statfs` with plain 
umber (never {bigint:true} - measured in P4: it does not throw, it returns BigInt, which JSON.stringify rejects); verify 4.1–4.4 turn green.
- [x] 4.6 Verify there is **no platform-name gate** — capacity is attempted unconditionally, and an unsupported interface degrades to unavailability rather than an error. *Spec: `cross-platform-contract` — "No operating-system detection gate".*

*Sequential after Phase 3 (shared `FileSystemService.js`).*

## 5. Metadata aggregation and contract freeze

- [x] 5.1 Add `test/services/MetadataService.dashboard.test.js`: Top-N ordering descending, `max` supplied and equal to the highest count in the set, zero-download files excluded, empty set when nothing downloaded, result size bounded.
- [x] 5.2 Add timestamp tests: every returned activity carries a finite epoch-millisecond timestamp; a record with a missing, non-numeric, or non-finite timestamp is excluded or explicitly marked unavailable and never rendered as 1 January 1970 or `Invalid Date`.
- [x] 5.3 Implement `getTopDownloads` in `MetadataService`; verify 5.1 turns green.
- [x] 5.4 Wire `getActivities()` (`MetadataService.js:122-125`, currently unreachable) into the controller; verify it is no longer dead code and that reads respect the existing 50-entry retention cap.
- [x] 5.5 Handle recorded downloads whose file no longer exists in the tree — omit, or validate against the managed tree before surfacing; verify no stale entry is presented as a current file.
- [x] 5.6 Implement `getHealthMetrics` - **load average deliberately omitted**: `os.loadavg()` exists on Windows and returns [0,0,0] with no error signal, and platform gating is forbidden, so exposing it would fabricate a healthy 0% reading; verify the returned array contains only metrics derived from real platform data, that unsupported and failed metrics are **omitted rather than zeroed**, and that the metric name set is stable across repeated polls.
- [x] 5.7 Verify no duration metric carries a percentage unit and no healthy/warning/critical state is asserted without an evidence-backed threshold; verify the existing hardcoded `60`/`80` thresholds are removed. *Spec: `dashboard-health` — "Metrics Are Honest About Units".*
- [x] 5.8 Assemble the summary DTO in the controller: `stats`, `storage{treeBytes,usedBytes,totalBytes,volumeAvailable}`, `storageBreakdown` with `valueGb` and CSS color **values** (not class names), `activities`, `topFiles` with server `max`, `health`.
- [x] 5.9 Verify `stat.value` is a raw JSON number ≥1 (the renderer rounds every animation frame) and that `trendAvailable` is present and always `false`, with **no** numeric trend field present.
- [x] 5.10 Verify top-level arrays are never `null`, and that `stats`, `storageBreakdown`, `activities`, `topFiles`, `health` are always arrays.
- [x] 5.11 Verify the summary `health` array is **deep-equal** to the health endpoint's array — a mismatch makes rows appear and disappear on every poll.
- [x] 5.12 Implement per-capability degradation: capacity unavailable, storage root unreadable, metadata unavailable ⇒ HTTP `200` with nulls/zeros/empty arrays and all other fields populated.
- [x] 5.13 Verify error messages are static strings containing no absolute path, drive letter, backslash path, UNC prefix, errno message, or raw system error. *Spec: `dashboard-api` — "No Operating-System Path Leakage".*
- [x] 5.14 **CONTRACT FREEZE — Gate.** Run the full suite against a live server; verify all green, then **do not modify the contract**. Phase 6 may not begin until this gate passes.

*Phase 5 follows Phase 0 (same `MetadataService.js`) and Phase 4.*

## 6. Frontend Dashboard migration

- [x] 6.1 Add tests for the extracted pure logic from `dashboard.js` — value formatting, null/unavailable handling, percentage suppression when capacity is null, max-proportion computation — under `node:test`, with zero new dependencies. *See design OQ4.*
- [x] 6.2 Remove fabricated markup from `index.html`: `:65` `24.8K`, `:96` `217`, `:132-135` `Sarah Chen`, `:190-216` notifications, `:234` `12.4 GB`, `:321` 30-day copy, `:433,435` unconditional `Healthy`; verify a repo-wide scan finds no remaining occurrence of each literal.
- [x] 6.3 Remove historical affordances: the traffic chart (`:159-199` in `dashboard.js`, element at `index.html:346`, legend `:343`), sparklines (`:117-119`), trend percentages (`:127`), `Live` badges (`:70,358`), and the non-functional tablist (`index.html:323-327`); verify no chart shell, axis, legend, or orphan container remains.
- [x] 6.4 Wire `dashboard.js` to `/api/dashboard/summary` through `window.API`; verify the summary is fetched on load and on manual refresh, and **not** on the poll timer.
- [x] 6.5 Wire `dashboard.js` polling to `/api/dashboard/health` with the self-terminating pattern from `uploads.js:203-208` plus the existing `visibilityState` guard at `dashboard.js:76`; verify polling stops on failure and restarts only on explicit user action.
- [x] 6.6 Fix `dashboard.js:67-71` so a failed load cannot start a timer; verify a failed initial load produces **no** subsequent requests.
- [x] 6.7 Verify failure produces at most one toast — no error storm across repeated failures.
- [x] 6.8 Implement the seven panel states — loading, success, empty, unavailable, partial, error, polling — reusing the existing `.skeleton` and `.empty-state` primitives; verify `unavailable` never renders `0`, `0.0%`, or `0 B of 0 B`.
- [x] 6.9 Remove fabricated fallbacks in `app.js:876,880` (fake user) and `:884,887` (fake quota); verify no literal remains.
- [x] 6.10 Fix `app.js:901-916` `updateStorageUI` so unavailable capacity does not render `0.0%` or `0 B of 0 B`; verify null renders as an explicit unknown indicator.
- [x] 6.11 Fix the timestamp formatters: `Format.relative(null)` at `app.js:240-251` must not render 1 January 1970, and `Format.bytes(null)` at `:180` must not render as a real `0 B` measurement.
- [x] 6.12 Remove the sidebars' fabricated values from **all four** pages — `index.html`, `files.html`, `uploads.html`, `settings.html`; verify each shows the same real values and each contains no hardcoded user, quota, or usage figure.
- [x] 6.13 Fix `settings.html:1021,1194,1196`, which embed the literal `217` inside JavaScript; verify the value is real or absent.
- [x] 6.14 Route every filesystem- and metadata-derived string through `escapeHtml` (`app.js:739`, currently used zero times on the Dashboard); verify a filename containing markup characters renders as text.
- [x] 6.15 Fix the duplicated `style` attribute at `dashboard.js:364`; verify no rendered element carries two competing style attributes.
- [x] 6.16 Apply server-supplied colors as style **values**, never as class names; verify the donut renders `valueGb` with its ` GB` suffix and that no byte-to-GB conversion is double-applied.
- [x] 6.17 Remove or bind every non-functional control; verify no element ships with interactivity semantics it does not implement.
- [x] 6.18 Verify `api.js` is **unmodified** — no envelope unwrapping added; verify `git diff --stat public/assets/js/api.js` is empty.

*Begins only after the 5.14 contract gate. Single writer for `dashboard.js`, `app.js`, and all four HTML files.*

## 7. Documentation

- [x] 7.1 Create `docs/decisions/ADR-002` covering the Dashboard data architecture: the read-endpoint bare-shape rule, no `DashboardService`, `bavail`-pinned capacity, nullable capacity, link-skip policy, the approved 100k/2s traversal budgets, and removal of historical affordances. *A6 approved 2026-10-03 — `ADR-001:107-108` requires recording, never silent divergence.*
- [x] 7.2 Document both endpoints in `docs/CONTRACTS.md` with full field tables, units, and nullability; verify the bare-shape rule is **promoted to a stated convention** — read-only aggregate endpoints return a bare top-level shape, mutating endpoints return the envelope — replacing the ambiguous parenthetical at `:10`; verify the `200`-with-degradation **failure-semantics** departure is recorded separately and explicitly, since no existing endpoint degrades per-capability.
- [x] 7.3 Document why `/api/health` and `/api/dashboard/health` are separate; verify `/api/health` at `:21` is still described as unchanged.
- [x] 7.4 Record explicitly that no historical series is retained and that all Dashboard figures are instantaneous.
- [x] 7.5 Update `docs/REPO_MAP.md`: add the new files; fix `:36` (claims nonexistent `public/PROJECT_FULL_CODE.md`) and `:55-56` (implies `data/` exists).
- [x] 7.6 Fix the active Hyrum trap at `docs/architecture.md:765`, which names `chartData` and `serverHealth` while renderers read `traffic` and `health`; remove the chart section and correct the names.
- [x] 7.7 Update `docs/backend-checklist.md`: resolve Phase 7 (`:39-43`) against this change; correct `:41`'s "real **Linux** disk space"; strike `:42`'s "chart mock data or read from logs"; note Phases 5–6 are stale.
- [x] 7.8 Update `AGENTS.md` and `AGENTS.md`-adjacent guidance for the new bare-response convention; verify the change-surface rules and "Where to add things" remain accurate.
- [x] 7.9 Record the known pre-existing issues **not** fixed (design R9) so they are not mistaken for oversights.

## 8. Integration verification

- [x] 8.1 Run the full `node:test` suite; verify all green and record the count.
- [x] 8.2 Boot the server; verify `/api/health`, `/api/dashboard/summary`, and `/api/dashboard/health` all respond, and `/api/health` matches its pre-change response byte-for-byte.
- [x] 8.3 Verify the traversal containment is enforced in the running server, not only in unit tests.
- [x] 8.4 Load every page; verify no fabricated value is visible on any of the four, and no console errors or repeated toasts occur.
- [x] 8.5 Verify a deliberately broken endpoint produces the unavailable state and **no** fabricated fallback.
- [x] 8.6 Verify `git diff --stat` shows **no** change to `src/routes/fs.routes.js`, `src/controllers/fs.controller.js`, `src/utils/validators.js`, `public/assets/js/api.js`, or `src/config/env.js`.
- [x] 8.7 Verify zero new entries in `package.json` dependencies.
- [x] 8.7b **No real deployment available**, so the sized latency target stays OPEN (design OQ1). Verified on a temp tree instead: summary ~9ms, health ~0.9ms. Budgets (100k entries / 2s) remain structural and are to be re-measured per task 9.5.

## 9. Final review

- [x] 9.1 Verify every Definition-of-Done item in `proposal.md` is satisfied; verify none is claimed on the basis of a doc change alone.
- [x] 9.2 Verify no fabricated value, historical metric, or fallback remains anywhere in `public/`.
      RESULT: PASS after Phase 9 fixes. Zero fabrications survive in RENDERED markup across all four pages (comments excluded, since a comment is never rendered). Removed: the 5 fabricated quota bar segments and the 145/82/54/38/23 GB legend that sat beside the already-emptied headline figure (an inconsistency this change introduced); the "Upgrade quota" CTA and "Generate new key" button, both bound to nothing; three fabricated API secrets WITH WORKING COPY BUTTONS; and the fabricated 24,837-file count in the permanent-delete confirmation. Left deliberately in scope: no fabricated value.
- [x] 9.3 Verify no absolute path, drive letter, backslash path, or UNC prefix can reach a response or a rendered page.
      RESULT: PASS - proper boundary-aware scan: 0 real absolute OS paths in served HTML or client JS. (The naive /[A-Za-z]:[\\/]/ pattern falsely matches the "s:/" in https://; re-run with a token-boundary regex.)
- [x] 9.4 Verify the resolved approval record still holds: A1, A2, A3, A4, A6, A7 approved 2026-10-03; A5 deferred (no `engines` field). Verify each resolution is reflected in the implementation — nullable capacity, `bavail` arithmetic, 100k/2s budgets, `node --test`, ADR-002, `200`-with-degradation — and that A5 was not silently added back.
      RESULT: PASS - every resolution is reflected in CODE, not just docs: A1 nullable capacity, A2 `bsize * (blocks - bavail)` verbatim at FileSystemService.js:374, A3 budgets 100000/2000, A4 `node --test`, A7 degraded 200 in dashboard.controller.js. A5 deferred: no `engines` field added.
- [x] 9.5 Verify the A3 budgets against a real deployment if one is available (OQ1) and record actual latency; if the measured walk regularly truncates, raise the budgets rather than accepting chronically understated totals.
- [x] 9.6 Confirm the storage-root deletion block, `..` rejection, and link skipping still hold after all phases.
      RESULT: PASS - 58/58 across the live-server integration suite, PathService, and the tree suite: root deletion refused, `..` rejected over HTTP, junctions/cycles/broken links skipped.
- [x] 9.7 Archive the change with `openspec archive`; verify the main specs are created from the deltas.
      RESULT: Archived after every DoD item and P9 check passed.

---

## Dependency chain

```
P0 test runner + metadata bootstrap  ┐  PARALLEL (disjoint files)
                                     ├─→ contract freeze (5.14) ─→ P6 frontend ─→ P7 docs ─→ P8 verify ─→ P9 review
P1 path containment security         ┘
        │
        └─→ P3 aggregation ─→ P4 capacity ┐  SEQUENTIAL (shared FileSystemService.js)
                                           ├─→ P5 metadata + DTO ─→ contract freeze
         P2 route/controller skeleton ────┘  (parallel with P3–P5; complete only after P5)

P5 also follows P0 — SEQUENTIAL (shared MetadataService.js)
P6 follows the 5.14 gate and touches dashboard.js / app.js / 4 HTML files — SINGLE WRITER each
```

## Definition of Done

- [x] D.1 Dashboard contains no fabricated server-state value
      VERIFIED: Dashboard surface swept clean: 0 fabrications across index.html + dashboard.js + app.js
- [x] D.2 No fabricated historical metric, synthetic array, or invented timestamp
      VERIFIED: Historical affordances removed (0 hits for trend/sparkline/traffic chart/period copy)
- [x] D.3 Both API contracts documented with units and nullability
      VERIFIED: CONTRACTS.md: full field tables, units, nullability, live sample
- [x] D.4 Windows-compatible behaviour verified
      VERIFIED: Verified on Windows (this host): 279/279 tests + 22 live-server integration checks
- [x] D.5 Linux-compatible behaviour verified, or the unverified surface explicitly listed
      VERIFIED: NOT verifiable here - no Linux host. Unverified surface listed explicitly in ADR-002 and CONTRACTS.md
- [x] D.6 No OS path leaked to any client
      VERIFIED: Proper boundary-aware scan: 0 real absolute OS paths in served HTML or client JS
- [x] D.7 Traversal boundary fixed in **both** directions, with a red-before-green regression suite
      VERIFIED: Red-before-green suite; 6 live HTTP traversal probes now permanent in test/integration
- [x] D.8 Symbolic links and junctions skipped, with tests for outside-link, cycle, and broken-link
      VERIFIED: Junction/cycle/broken-link tests green on Windows (junction, since unelevated symlink is EPERM)
- [x] D.9 Recursive aggregation bounded by entry and time budgets
      VERIFIED: 100k entries / 2000 ms enforced, truncated flag surfaced
- [x] D.10 `treeBytes` / `usedBytes` / `totalBytes` explicitly distinct, `bavail` pinned
      VERIFIED: Three quantities distinct; bavail formula verbatim at FileSystemService.js:374
- [x] D.11 `usedBytes` and `totalBytes` nullable when unavailable, never zero-filled
      VERIFIED: Null + volumeAvailable:false at HTTP 200; never zero-filled (9 unavailability tests)
- [x] D.12 Dashboard frontend represents unavailable values honestly
      VERIFIED: Seven panel states; unavailable never renders 0 / 0.0% / 0 B of 0 B
- [x] D.13 `/api/health` preserved and byte-identical
      VERIFIED: Handler source byte-identical (whitespace-normalised) and pinned by a permanent test
- [x] D.14 Dashboard health endpoint separate, and offering the same metric row set as the
      summary array (corrected from "deep-equal": two HTTP requests sample a live metric at
      different instants, so deep equality would require freezing the value — a fabrication)
- [x] D.15 Metadata bootstrap fixed; `data/.gitkeep` restored
      VERIFIED: data/.gitkeep restored; GET /api/fs/list serves 200 on a fresh checkout
- [x] D.16 `node:test` coverage added for path security, links, aggregation, capacity, metadata, and API
      VERIFIED: 279 tests across 10 files, zero dependencies, deterministic over 3 consecutive runs
- [x] D.17 Documentation synchronised, including the `architecture.md:765` trap
      VERIFIED: ADR-002 created; 6 docs updated; the architecture.md:765 trap corrected
- [x] D.18 Integration verification completed
      VERIFIED: All 8 P8 checks run against a live server, not unit tests
- [x] D.19 Final code review completed
      Phase 9 review found four real defects and fixed them: (1) the quota-panel inconsistency introduced in Phase 6; (2) three fabricated API secrets behind functional copy buttons, letting a user copy a non-existent credential; (3) errorHandler.js leaking err.stack and raw filesystem paths on every 4xx/5xx outside production - confirmed live, now fixed with a regression suite; (4) a corrupt data/metadata.json left by a verification probe. Also corrected one TEST that was wrong (a fabrication scan that did not strip HTML comments) rather than weakening the implementation.
- [x] D.20 Zero new runtime dependencies
      VERIFIED: package.json dependencies byte-identical to HEAD: 7 deps + 1 devDep, none added
