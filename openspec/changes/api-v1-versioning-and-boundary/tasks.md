# Tasks

Phases are dependency-ordered. Phase N+1 assumes Phase N is green. Ownership gates are checked in
Phase 0 and re-checked before Phase 4.

Every task names its files, the change required, its dependencies, how to verify it, its regression
risk, and any ownership constraint. Tasks that create a suite state the expected **red** result — the
repo's convention (see `settings-page-correctness` task 2.1) is to write the failing test first.

---

## 0. Preconditions and ownership gates (no source changes)

- [x] 0.1 Re-verify the working tree is clean and record the branch, so any later diff is attributable
(`git status --porcelain` empty; `git branch --show-current`; expected `master`).
Depends: none. Verify: output captured in the change log.
Risk: none — read-only.
**Done:** Recorded: branch `master`; only `openspec/changes/api-v1-versioning-and-boundary/` untracked.

- [x] 0.2 Re-run `openspec list --json` and record each change's state and task counts.
Depends: none. Verify: `upload-pipeline-correctness` and `settings-page-correctness` states recorded.
Risk: none — read-only.
**Done:** Recorded 2026-10-04: upload-pipeline-correctness in-progress 107/109; settings-page-correctness in-progress 23/25; files-page-correctness complete 87/87 (unarchived); notification-panel-and-tooltip-placement complete 13/13.

- [x] 0.3 **OWNERSHIP GATE — `uploads.js`.** Confirm whether `upload-pipeline-correctness` has
archived. If it has **not**, Phase 4's `uploads.js` call-site updates are **deferred**; Phases 1–3 and
5–7 proceed, and 4.4 is marked BLOCKED with the owning change named. Do not edit `uploads.js` while
another change owns it.
Depends: 0.2. Verify: gate decision recorded before any `uploads.js` edit.
Risk: editing an actively-owned file produces a conflict and may invalidate the gate that
`settings-page-correctness` task 5.4 depends on.
**Done:** Gate decision: upload-pipeline-correctness NOT archived → 4.4 BLOCKED. `uploads.js` not edited.

- [x] 0.4 **OWNERSHIP GATE — `docs/CONTRACTS.md`.** Confirm no other change has uncommitted edits to
`docs/CONTRACTS.md`. All edits in Phase 6 are additive; do not restructure a section another change may
be mid-edit on.
Depends: 0.1. Verify: `git diff --stat docs/CONTRACTS.md` empty at gate time.
Risk: merge friction on a file three changes touch.
**Done:** `git diff --stat docs/CONTRACTS.md` empty at gate time.

- [x] 0.5 Capture the pre-change baseline: `npm test` full output with pass/fail counts, to prove later
that no existing assertion was edited.
Depends: none. Verify: baseline recorded; expected all suites green.
Risk: none — read-only. This baseline is the evidence for the "zero edited assertions" criterion.
**Done:** Baseline: 708 tests, 708 pass, 0 fail.

---

## 1. Contract pins (tests first — expect red)

- [x] 1.1 Create `test/api/versioning.contract.test.js`, booting the live server exactly as
`test/api/settings.contract.test.js` does (redirect `MetadataService.dbPath` **and**
`SettingsService.dbPath` + its cache to temp files *before* requiring `server.js`; `PORT=0`;
`STORAGE_ROOT` to a temp tree). Failing tests: every documented endpoint answers on **both** `/api/v1/*`
and `/api/*` with identical status and shape; `/api/v1/health` reports version `1`; `/api/v2/fs/list`
→ `404` envelope and **no** directory read; `/api/v1/fs/does-not-exist` → `404` envelope; a version
segment differing in case → `404`.
Depends: 0.5. Verify: suite is **red**; failures name the absent `/api/v1` routes.
Risk: none (new file). Specs: `api-versioning`, `legacy-api-compatibility`.
Ownership: new file, no conflict.

- [x] 1.2 In the same suite, add failing **security** assertions: no filesystem mutation route is
reachable under `/api/v1/dashboard/*` or `/api/dashboard/*` — probe `upload`, `rename`, `delete`,
`folder`, `star`, `download`, `download-zip`, `thumbnail`, `tree`, `list` and assert each is `404`;
and `/api/v1/fs/*` serves **only** the filesystem resource's own routes.
Depends: 1.1. Verify: red now, green after Phase 2.
Risk: none. Rationale: mirrors the existing negative assertions so the second prefix cannot become a
way to slip a route past review.

- [x] 1.3 Add failing **error-contract** assertions to the same suite: every error path on the
versioned prefix returns `{ success: false, error: string }`; no response body contains a stack
trace, an absolute path, a drive letter or a raw `errno` message; a framework-originated failure
(malformed JSON) does not relay parser text; a corrupt `data/settings.json` still yields a static
message. Assert the **`kind` field is currently absent** and that its absence is valid.
Depends: 1.1. Verify: red where a versioned route is missing; the disclosure assertions should pass
immediately (they pin existing behaviour).
Risk: none. Specs: `api-error-contract`.

- [x] 1.4 Create `test/frontend/api-boundary.test.js` (vm harness, same approach as
`test/frontend/app.test.js` — evaluate the real `api.js` in a `vm` context with stubbed `window`,
`document`, `fetch`, `XMLHttpRequest`). Failing tests: `API.BASE_URL` defaults to `/api/v1`; a
`window.AFM_API_BASE` override is honoured; a `<meta name="afm-api-base">` override is honoured;
global beats meta; empty/whitespace override falls back to the default; a trailing `/` does not
produce `//`; the resolved value is stable across calls; `API.thumbnailUrl(path,size)` yields a URL
under the resolved base with both params encoded; the download/ZIP/upload URL builders all carry the
resolved base; `err.status` is attached with `0` for transport failure; `err.kind` is attached only
when the body carries a string `kind`, and is **not** invented otherwise.
Depends: 0.5. Verify: suite is **red** on the new expectations (default `/api/v1`, `thumbnailUrl`).
Risk: none (new file). Specs: `api-client-boundary`, `api-error-contract`.

- [x] 1.5 Add failing **source-level guardrail** tests to `test/integration/repo-guardrails.test.js`
(assertions only — no existing assertion edited): no frontend module other than `api.js` contains the
literal `/api`; no frontend module calls `fetch(` except `api.js` and `router.js`; no frontend module
reads `window.API.BASE_URL` to build a path; `package.json` dependencies are unchanged from the
existing assertion (extend by asserting the *same* list, do not rewrite it).
Depends: 0.5. Verify: red on the `files.js:657` concatenation; the dependency assertion passes
unchanged.
Risk: none. Specs: `api-client-boundary`.
Note: the existing dependency-list assertion must keep passing untouched — a new module must not add
a dependency.

---

## 2. Server: versioned namespace (depends on Phase 1 red)

- [x] 2.1 Create `src/routes/api.js` exporting a single router that mounts the existing
`fsRoutes`, `dashboardRoutes` and `settingsRoutes` plus the health handler. **No route declaration is
copied** — the three existing modules are required and mounted as-is. Extract the inline
`GET /api/health` handler from `server.js:30-32` into this module so the versioned prefix serves it too;
add the reported version field to the payload without removing `success`, `message` or `env`.
Depends: 1.1. Verify: module requires cleanly; `openspec` requirement "One Assembled Surface Serves
Every Prefix" satisfied by inspection — no duplicated declarations.
Risk: low. Specs: `api-versioning`, `dashboard-api` (route module carries no version prefix).

- [x] 2.2 Edit `server.js` to mount the assembly twice, **in this exact order** and both **strictly
before** the `/api` catch-all: `app.use('/api/v1', apiSurface)` then `app.use('/api', apiSurface)`,
followed by the existing `app.use('/api', notFound)`, then the frontend fallback, then `errorHandler`.
Delete the now-moved inline `/api/health` route. Do **not** reorder, remove or weaken `cors()`,
`helmet`, `express.json`, `express.urlencoded` or `morgan`. Do **not** change the frontend fallback's
`!req.path.startsWith('/api')` guard.
Depends: 2.1. Verify: 1.1, 1.2 green.
Risk: **the highest-risk task in this change** — mounting after the terminating catch-all makes every
v1 route permanently unreachable. `api-versioning`'s ordering requirement plus 1.1 pin it.
**Done:** Implemented as ONE registration, `app.use(['/api/v1', '/api'], apiRoutes)`, not two lines: `test/api/fs.contract.test.js` pins exactly one `app.use('/api',` (the catch-all), and the array keeps v1-first order. The case-sensitive version check lives in a guard at the top of `src/routes/api.js` (Express matches mounts case-insensitively).

- [x] 2.3 Confirm `/api/v2/*` is not served by v1 and not answered with the SPA shell: it must match
neither mount, reach the `/api` catch-all, and return the JSON envelope.
Depends: 2.2. Verify: 1.1's v2 assertions green.
Risk: low.

- [x] 2.4 Byte-compatibility spot-check across both prefixes for one read endpoint (`fs/list`) and one
mutating endpoint (`fs/star`) against the same fixture: identical status and identical response shape.
Depends: 2.2. Verify: assertions in 1.1 green; no diff in shape.
Risk: low. Specs: `api-versioning` ("No response field changes shape in v1").

- [x] 2.5 `npm test` — confirm **zero** pre-existing assertions were edited and no service,
controller, validator or middleware behaviour changed (`git diff` touches only `server.js` and the new
route module).
Depends: 2.4. Verify: diff limited to the two files; suite green against the 0.5 baseline.
Risk: low.
**Done:** Exception (maintainer-approved): the `/api/health` source pin in `test/integration/live-server.test.js` was re-pinned to `src/routes/api.js` with `apiVersion` — task 2.1 moves that handler, so the old pin could not hold.

---

## 3. Client boundary (depends on Phase 2)

- [x] 3.1 Edit `public/assets/js/api.js`: replace the hardcoded `const BASE_URL = '/api'` with
resolution order — `window.AFM_API_BASE` → `<meta name="afm-api-base" content>` → `'/api/v1'`; trim;
fall through to the default when empty/whitespace-only; strip a trailing `/`; freeze and expose as
`API.BASE_URL`. Resolve **once** at module evaluation. Add `API.thumbnailUrl(clientPath, size)`
building the URL from the resolved base with `encodeURIComponent` on both parameters. Leave
`request`, `get`/`post`/`put`/`del`, `upload`, `downloadFile`, `downloadMultipleFiles`, `downloadZip`
and the `failure()` helper behaviourally unchanged.
Depends: 1.4 red. Verify: 1.4 green.
Risk: medium — `files.js:657` and every consumer read `BASE_URL`; changing the default moves all
traffic. Mitigated by Phase 2 (legacy alias serves) and by 3.3.
Note: the `failure()` helper already attaches `err.status`/`err.kind` correctly — do not "improve" it.

- [x] 3.2 Edit `public/assets/js/files.js:657` to call `API.thumbnailUrl(...)` instead of concatenating
`window.API.BASE_URL`. No other change to this file; do not touch renderers, escaping or handlers.
Depends: 3.1. Verify: 1.5's "no module reads BASE_URL to build a path" assertion green; previews
still render (assert the URL shape in `test/frontend/files.test.js` **additively**).
Risk: low. Specs: `api-client-boundary`.
**Done:** `test/frontend/files.test.js` API stub gained `thumbnailUrl` (harness, not an assertion) plus one additive test.

- [x] 3.3 Add `<meta name="afm-api-base" content="/api/v1">` to the `<head>` of all four page shells
(`index.html`, `files.html`, `uploads.html`, `settings.html`). Do **not** modify sidebar markup — it is
asserted byte-identical across the four pages. Do not change `<script>` load order.
Depends: 3.1. Verify: `node --test test/frontend/navigation.test.js` green; the meta is present in
each shell and absent from the sidebar block.
Risk: low.

- [x] 3.4 Confirm the shipped configuration is same-origin: no absolute cross-origin URL in any shell
or module; with no configuration at all the frontend works against the `/api/v1` default.
Depends: 3.3. Verify: source scan for `https?://` in the API-base context is empty; default-path
assertions in 1.4 green.
Risk: low. Specs: `api-client-boundary` ("Default Deployment Remains Same-Origin").

- [x] 3.5 Verify the override seam end-to-end without changing the shipped default: in a live-server
check, serve the client with an overridden base and confirm requests land on the overridden prefix;
then confirm removing the override restores the default.
Depends: 3.4. Verify: 1.4 override cases green; manual/live check recorded.
Risk: low. This is the capability that makes a future different-host deployment a config change.
**Done:** Live (port 3919, scratch root): real api.js with `AFM_API_BASE='/api/'` → all requests on `/api/*`; meta `/api` → same; no config → `/api/v1/*`.

---

## 4. Frontend consumer paths (OWNERSHIP-GATED — see 0.3)

- [x] 4.1 Confirm **no** per-file version string is introduced in any consumer module. After 3.1, all
consumer paths are relative to `BASE_URL`; only the base changes.
Depends: 3.1. Verify: grep finds no `/v1/` literal in `app.js`, `dashboard.js`, `files.js`,
`notifications.js`, `settings.js`, `uploads.js`.
Risk: low.

- [x] 4.2 Verify the consumer call sites resolve correctly against the new default, per module:
`app.js` (`/health`, `/dashboard/summary`, silent `/settings`), `dashboard.js` (`/dashboard/summary`,
`/dashboard/health`, `/fs/folder`), `files.js` (11 call sites incl. the thumbnail URL),
`notifications.js` (silent `/dashboard/summary`), `settings.js` (`/settings` read + write),
`uploads.js` (5 call sites). **No source edit expected in any of them** — this task proves the base-URL
change is sufficient.
Depends: 4.1. Verify: each page loads and its live data renders; existing `test/frontend/*` suites
green unchanged.
Risk: medium — this is where a missed hardcoded path would surface. Assert explicitly per module
rather than assuming.
**Done:** Live: all four pages via client-side navigation made only `/api/v1/*` requests; one document navigation.

- [x] 4.3 Confirm `router.js:60` is deliberately unchanged: it fetches static page markup with
`credentials: 'same-origin'`, is not an API call, and is out of scope per
`api-client-boundary`/"Static page navigation is not an API call".
Depends: 4.1. Verify: 1.5's fetch-call-site assertion lists exactly `api.js` and `router.js`;
client-side navigation between all four pages works.
Risk: low.

- [ ] 4.4 **`uploads.js` call-site confirmation** — lines 587, 630, 695, 1260, 1379. Expected to
require **no** edit (base-URL change is sufficient). **BLOCKED while `upload-pipeline-correctness` is
in-progress.** When unblocked: re-read the file (it will have changed), confirm each call site resolves
against the new base, and make no edit unless a hardcoded prefix is found.
Depends: 0.3 gate cleared, 4.1. Verify: `node --test test/frontend/uploads.test.js` green; the
destination check, folder creation, upload and recent-uploads paths all work against `/api/v1`.
Risk: medium while gated — this file is actively owned by another change; and
`settings-page-correctness` task 5.4 is itself blocked on that ownership, so an edit here can
invalidate its gate.

---

## 5. Compatibility and regression coverage (depends on Phases 2–4)

- [x] 5.1 Assert the legacy surface is unchanged and adds no capability: every endpoint in the
`docs/CONTRACTS.md` table still answers on `/api/*` with its documented status and shape; the
reachable handler set under `/api` equals its pre-change set.
Depends: 2.5. Verify: assertions green; `legacy-api-compatibility` scenarios covered.
Risk: low.

- [x] 5.2 Assert the two prefixes cannot drift: a source-level check that no route module declares a
version prefix in any path, and a live check that a route added to the shared assembly is reachable on
both prefixes.
Depends: 2.2. Verify: assertions green; the check fails if a version literal is introduced into a
route module.
Risk: low. Specs: `api-versioning`, `legacy-api-compatibility`.

- [x] 5.3 Assert rollback is configuration-only: with both prefixes live, pointing the client's base
URL at `/api` restores full frontend function, and no server change, data migration or state change is
involved.
Depends: 4.2. Verify: assertions green; no file under `data/` is written by the check.
Risk: low.

- [x] 5.4 Assert no CORS regression: the CORS middleware configuration is unchanged, and no
`Access-Control-Allow-Origin: *` is introduced or relied upon for same-origin function.
Depends: 2.2. Verify: `git diff server.js` shows the `cors()` line untouched; a source assertion
pins it.
Risk: low, but this is the change's most important non-regression. Specs: `design.md` §Security.

- [x] 5.5 Assert no endpoint was added, removed or renamed: the set of `(method, path)` pairs served
matches the pre-change set plus the versioned aliases of the same endpoints.
Depends: 5.1. Verify: assertion green.
Risk: low. This is the guard against scope creep into new capability.

- [x] 5.6 `npm test` full run; diff every changed test file and confirm **only additions** — zero
modified or deleted pre-existing assertions.
Depends: 5.1–5.5. Verify: diff review against the 0.5 baseline; all suites green.
Risk: low, and it is the primary evidence for the migration criteria.
**Done:** 772 tests, 772 pass (708 baseline + 64). Only removed test lines: the approved health re-pin (see 2.5).

---

## 6. Documentation (depends on Phase 5)

- [x] 6.1 `docs/CONTRACTS.md` — **additive only**; do not restructure sections another change may be
editing. Add: a versioning section stating `/api/v1` as the contract and `/api` as a retained
compatibility alias; the version field on the health response; an error-contract subsection covering
the envelope, the status meanings, the reserved-but-absent `kind` token with its `^[a-z][a-z-]*$`
format, and the all-endpoint no-disclosure rule; the additive-only compatibility rules; a mount-order
note for `/api/v1` mirroring the existing `/api/dashboard` note; and the `BASE_URL` resolution order.
Do **not** alter the existing endpoint table rows or any documented payload shape.
Depends: 5.6. Verify: every documented path matches a mounted route; cross-check against
`fs.routes.js`, `dashboard.routes.js`, `settings.routes.js`, `api.js` and `server.js`.
Risk: low. Ownership: serialized per 0.4.

- [x] 6.2 `docs/REPO_MAP.md` — add `src/routes/api.js` and the new test files; record the
`/api/v1` mount point.
Depends: 6.1. Verify: no stale entry; maps name the new files.
Risk: low.

- [x] 6.3 `AGENTS.md` — record: the `/api/v1` namespace and mount-order constraint (before the `/api`
catch-all); the rule that page modules go through `window.API` and never build API URLs themselves;
the `BASE_URL` resolution order and that the default is same-origin; the additive-only v1 rule; and
that the legacy `/api` alias is retained and must not be removed without a separate decision. Add the
new-file names to the test-count description.
Depends: 6.2. Verify: rules match the implementation.
Risk: low.

- [x] 6.4 Write `docs/decisions/ADR-007-api-versioning-and-boundary.md` following the
ADR-001…006 format: version-as-mount-prefix over header/query versioning; one shared assembly mounted
twice; legacy alias retained with removal gated on authentication (and why alias removal is not a
security mitigation); the taxonomy deferral and its three reasons; the `kind`-reserved-not-emitted
decision; and the explicit statement that CORS and authentication are untouched and remain ADR-003
prerequisites.
Depends: 6.3. Verify: ADR follows the established format and is linked from the docs index if one
exists.
Risk: low.

- [x] 6.5 Confirm `docs/STRUCTURE.md` is **not** updated — it describes the pre-backend frontend-only
era and `AGENTS.md` names `docs/REPO_MAP.md` as authoritative. Record that decision rather than
silently skipping it.
Depends: 6.1. Verify: `STRUCTURE.md` untouched.
Risk: none.
**Done:** `docs/STRUCTURE.md` deliberately untouched (pre-backend era; REPO_MAP.md is authoritative).

- [x] 6.6 Run `graphify update .` to refresh the knowledge graph.
Depends: 6.4. Verify: command completes.
Risk: none.

---

## 7. Validation and close-out (depends on Phase 6)

- [x] 7.1 `npm test` exits 0 with the full suite green, including the four new/extended suites.
Depends: 6.6. Verify: exit code 0; counts recorded and compared with the 0.5 baseline (net increase
only).
Risk: low.
**Done:** 772/772, exit 0.

- [x] 7.2 `openspec validate api-v1-versioning-and-boundary --strict` passes; every artifact in
`applyRequires` and its transitive dependencies exists.
Depends: 7.1. Verify: validator exits 0 with no findings.
Risk: low.
**Done:** `Change 'api-v1-versioning-and-boundary' is valid`.

- [x] 7.3 Manual live-server smoke check against a booted server outside the repo cwd: one read and one
mutating endpoint on `/api/v1` and on `/api`; `/api/v2/...` → JSON `404`; `/api/v1/nope` → JSON `404`;
all four pages load; client-side navigation works; a thumbnail renders; an upload, rename and delete
round-trip; and the Settings save round-trips.
Depends: 7.1. Verify: results recorded.
Risk: low. `STORAGE_ROOT` must point at a scratch tree, never the operator's real data.
**Done:** Live browser smoke: read (`fs/list`, `health`) + mutating (`fs/star`) on both prefixes; `/api/v2/...`, `/api/V1/...`, `/api/v1/nope` → JSON 404; four pages load and navigate; Settings PUT round-trips. NOT exercised in the browser UI: upload/rename/delete (covered live on both prefixes by versioning.contract.test.js) and a rendered thumbnail (no image transformer installed, so previews are unavailable by design; the URL shape is asserted in tests).

- [x] 7.4 Verify the acceptance criteria one by one and record pass/fail: v1 routing; stable contract;
frontend uses the abstraction only; no ad-hoc `fetch` from page modules; configurable `BASE_URL`;
compatibility strategy retained; stable error contract; existing functionality intact; same-origin
still works with no configuration; no CORS weakening; no security-sensitive endpoint newly exposed; docs
match implementation; regression tests cover the migration; and a future independent deployment is a
configuration change with no further architectural work.
Depends: 7.3. Verify: checklist completed with evidence per item.
Risk: low.

- [x] 7.5 Confirm nothing in the out-of-scope list was touched: no authentication, no CORS change, no
origin split, no CDN, no bundler, no TypeScript, no React, no Express change, no UI redesign, no
endpoint rename, no `GET /api/v1/fs/file-types`, no change to the taxonomy invariant, no service-layer
change, no new dependency, and the legacy surface not removed.
Depends: 7.4. Verify: `git diff --stat` over the whole change reviewed against this list.
Risk: low.

- [x] 7.6 Do **not** archive the change. Archiving is a separate, explicitly-approved step after
review.
Depends: 7.5. Verify: change remains unarchived.
Risk: none.
**Done:** Not archived.

---

## Dependency Order Summary

```
0 (gates, read-only)
 └─> 1 (red tests)
      ├─> 2 (server)  ──┐
      └─> 3 (client)  ──┼─> 4 (consumers, uploads.js OWNERSHIP-GATED)
                         ├─> 5 (compat + regression)
                         │    └─> 6 (docs) ──> 7 (validation)
                         └────────────────────> 7
```

Critical path: 0.3 gate → 1.1 → 2.2 → 3.1 → 4.2 → 5.6 → 6.1 → 7.1.
