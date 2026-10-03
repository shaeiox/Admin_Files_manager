# Design

## Context

See `proposal.md` → *Why* for motivation. This section records only the current state and constraints that shape the approach.

**Repository state.** Node.js CommonJS Express 5 app. Layered flow is `routes → controllers → services → fs`. Three service modules exist: `FileSystemService` (static class), `PathService` (static class), `MetadataService` (instance singleton). `server.js:32` is the only router mount; `fs.routes.js` is mounted at `/api/fs` only. `server.js:35-37` and `:40-42` are two-argument `/api` catch-alls that never call `next()`, so they terminate the chain — anything not matched before them is unreachable.

**Client.** Vanilla JS, no build step. IIFE modules attach to `window`. `api.js:71` returns the parsed body verbatim; there is no `.data` unwrap anywhere in the client. All four HTML pages duplicate the sidebar markup; `sidebar.js` has no shared-layout mechanism.

**Hard constraints from `AGENTS.md`.** Path boundary is `PathService.resolveSecurePath`. Absolute `securePath` never leaves the services layer. Errors are `AppError`. Success envelope is `{success:true,data}` — **this change deliberately departs from it** (see D2). Async I/O only. Frontend calls go through `window.API`. Docs (`CONTRACTS.md`, `REPO_MAP.md`) are kept in sync or treated as bugs.

**Two blocking facts discovered during investigation.**

1. `PathService.js:31` uses `targetPath.startsWith(rootPath)` with no separator boundary. Verified: with root `D:\download`, client path `/../download-secret/x` is **ALLOWED** and resolves to `D:\download-secret\x`. `validateClientPath` (`validators.js:61-72`) permits `..`, so the traversal reaches `fs.rm(..., {recursive:true, force:true})` at `FileSystemService.js:164`. `toClientPath` (`:46`) has the identical flaw.
2. `data/` is absent from the working tree and `git ls-files data` is empty. `MetadataService.js:26-31` awaits `_write()` **inside its own `catch`**, so after the first `ENOENT` the second `ENOENT` escapes as a raw `Error`, not an `AppError` → generic 500. `GET /api/fs/list` is therefore already broken on a fresh checkout. This is a prerequisite, not a Dashboard concern.

**Runtime environment used for verification.** Node v24.15.0, win32 x64, NTFS. s.promises.statfs returns plain 
umber. CORRECTION (measured in P4): `{bigint:true}` does NOT throw here - it succeeds and returns BigInt. The hazard is one step later: `JSON.stringify` on a BigInt throws `TypeError: Do not know how to serialize a BigInt`, turning a capacity read into a 500 at serialisation time. Directory `stat().size` is `0` on Windows but block-sized on ext4 — this is precisely why directory sizes must be excluded. Windows reports `bfree === bavail`; ext4 diverges by roughly 20×. Windows reports `files`/`ffree` as `0`. This asymmetry is the evidence for pinning `bavail`.

**Unmeasurable at authoring time.** The configured `STORAGE_ROOT` does not exist in the verification environment, so real tree size and cross-platform validation of the aggregation cannot be measured here. Bounds are therefore specified structurally (entry + time budget) rather than as a sized latency target.

---

## Goals / Non-Goals

**Goals.**

- Every Dashboard figure is derived from real server state or is explicitly marked unavailable.
- One HTTP contract that is field-for-field identical on Windows and Linux, carrying no OS-specific detail.
- Containment is a single, provably correct choke point that a recursive walk can depend on.
- Recursive aggregation is bounded, link-safe, and degrades per-subtree rather than failing wholesale.
- Zero new runtime dependencies.
- Test coverage on the security boundary and the arithmetic that produces user-visible numbers.

**Non-Goals.**

- **Authentication / authorization.** Explicitly excluded. `/api/health` remains unauthenticated.
- **A quota or plan system.** Capacity is reported, never enforced.
- **Historical persistence.** No snapshots, no time-series store. See `specs/dashboard-historical-metrics/spec.md`.
- **A `DashboardService`.** See D3.
- **Cross-directory move.** Rename stays same-directory by design (`AGENTS.md` red line).
- **Trash / recycle bin.** Deletion stays permanent.
- **Backend logging pipeline.** `morgan('dev')` writes to stdout only; no log parsing is introduced to fabricate the traffic chart.
- **Refactoring the pre-existing `_extKey` taxonomy in `fs.controller.js:93-104`.** It is reused where it lives (D7).
- **Fixing the other pre-existing issues** enumerated in Risks R9.

---

## Architecture

### Request flow

```
GET /api/dashboard/summary
  └─ server.js  (mounted BEFORE the /api catch-all — D1)
     └─ routes/dashboard.routes.js        no filesystem access, no logic
        └─ controllers/dashboard.controller.js   composes services (D3)
           ├─ FileSystemService.getTreeStats(root)   bounded walk, links skipped
           ├─ FileSystemService.getVolumeStats(root) statfs, bavail-pinned
           └─ MetadataService.getActivities() / .getTopDownloads(n)
              └─ fs/promises                              (services only)
```

```
GET /api/dashboard/health
  └─ same mount → dashboard.routes.js → dashboard.controller.js
     └─ FileSystemService.getHealthMetrics()  → bare metric array
```

### Route / controller structure

`src/routes/dashboard.routes.js` declares exactly two `router.get` bindings. It performs no I/O. `src/controllers/dashboard.controller.js` exports two async handlers; it composes existing services directly and is the only place that shapes DTOs.

### Service responsibilities

| Service | New members | Responsibility |
|---|---|---|
| `PathService` | none (fix existing) | Containment boundary. Both directions corrected. |
| `FileSystemService` | `getTreeStats`, `getVolumeStats`, `getHealthMetrics` | All filesystem reads: bounded walk, capacity, platform metrics |
| `MetadataService` | `getTopDownloads`, bootstrap fix | Activity + ranking reads, lazy `data/` creation |
| `DashboardService` | **does not exist** | — |

Services return raw, platform-native values. **DTO shaping happens only in the controller.** `FileSystemService.getStats` already returns `securePath` (`:18`); nothing new may do so, and existing callers are unchanged.

### Filesystem aggregation strategy

Iterative depth-first walk, **explicit stack, no recursion** — a recursive implementation risks stack exhaustion on a deep tree and makes budget enforcement awkward.

Per directory entry, via `readdir(dir, {withFileTypes:true})`:

```
dirent.isSymbolicLink() === true   → skip entirely (no descent, no count, no name)
dirent.isDirectory()  === true    → count folder (root excluded), push onto stack
name startsWith '.'               → skip  (matches fs.controller.js listing behaviour)
otherwise                         → count file, accumulate size
```

Files contribute `dirent` size from the entry metadata; **directory entries never contribute size.** This is the single most important cross-platform rule in the design: `stat().size` for a directory is `0` on Windows and block-sized on ext4, so including it would make identical content report different totals per host.

The stack holds client paths, never native paths — native paths are constructed only at the syscall boundary inside the service.

### Storage capacity strategy

`fs.promises.statfs(resolvedRoot)`. Native 
umber, never {bigint:true}. CORRECTION (measured in P4): `{bigint:true}` does NOT throw here - it succeeds and returns BigInt. The hazard is one step later: `JSON.stringify` on a BigInt throws `TypeError: Do not know how to serialize a BigInt`, turning a capacity read into a 500 at serialisation time. The conclusion is unchanged; only the mechanism was wrong.

```
totalBytes = bsize * blocks
usedBytes  = bsize * (blocks - bavail)
```

`bsize` is read, never assumed, and never multiplied by 1024 — the reported block size is not guaranteed to be a power of two. `bavail` is pinned because on Windows `bfree === bavail` while ext4 diverges ~20×, so `bavail` is the only value with consistent cross-platform semantics (unprivileged-available).

Unavailable → `usedBytes: null`, `totalBytes: null`, `volumeAvailable: false`, **HTTP 200**. Zero is never substituted: `0` reads as a real measurement. A non-positive capacity also yields unavailability.

### Symlink / junction policy

`dirent.isSymbolicLink() === true` ⇒ skip entirely. One rule, both platforms, no OS branch. This primitive is already in use at `FileSystemService.js:46`.

Why this rule and not "resolve then check containment":

- `fs.stat` **follows** links — verified on Windows, a junction reports `isDirectory() === true`. Any containment check built on `stat` sees the link target as an ordinary directory.
- A naive walk through a junction escaped the root and terminated only at an OS resolution cap (~63 hops Windows, ~40 Linux) — an unbounded-work bug, not a correctness bug.
- A cycle to an ancestor would otherwise recurse until the budget, producing a wrong answer rather than no answer.

Verified Windows asymmetry, recorded so the test suite is written correctly: `fs.symlink(...,'file')` → `EPERM` (needs elevation) while `fs.symlink(...,'junction')` → succeeds unelevated. Tests must create **junctions** on Windows. `fs.rm(recursive)` does not delete *through* a junction, so test cleanup is safe.

### Security boundary

`PathService` remains the single choke point. Correction in **both** directions:

```js
const contained = target === root || target.startsWith(root + path.sep);
```

- Native `path.sep`, no OS branch.
- **One resolution basis.** Both sides produced by the same function. A `realpath`-canonicalised root compared against a `resolve`-produced target is a bug on case-insensitive volumes, where the canonical form may differ in letter case or use a short name.
- `toClientPath` gets the mirror fix — otherwise the reverse conversion can masquerade an outside absolute path as an in-tree client path.

Verified denial across five root spellings (`D:\download`, `D:\download\`, `D:/download`, `d:\Download`, `D:\download\.\`) plus POSIX, for `/../download-secret/x`, `/a/../../download-2/x`, and equivalent variants.

This fix is a **prerequisite**: the Dashboard walk would otherwise traverse outside the root on every request, turning a latent write-path vulnerability into a read-path information leak on an unauthenticated endpoint.

**Phase 1 implementation findings** (recorded after implementation, all empirically verified):

- **The vulnerability was narrower than "traversal".** Plain `..` escape was *already* blocked pre-fix — `<parent>/escape` does not share the `download` name prefix. Only **name-prefix siblings** (`download-backup`, `download-secret`) escaped. The naive check was a name-prefix flaw, not a general traversal flaw. Recorded so nobody concludes the old check blocked traversal generally.
- **The old check was also inconsistent across root spellings.** With root `d:\Download`, the case-sensitive compare *accidentally denied* the sibling escape, while the other four spellings allowed it. The case-variant root was secure by accident, not by design.
- **`path.resolve` does not case-fold.** `d:\Download` resolves to `d:\Download`, not `D:\download`. Separator and current-directory normalisation happen; letter-case normalisation does not. The spec required only *verdict* invariance, which holds — but no doc may claim all five spellings normalise to one string.
- **Containment is case-sensitive, so it fails closed.** On a case-insensitive volume, a client path re-entering the root with different letter case is denied (403) even though it denotes the same directory. This is a false rejection, not a bypass. Not reachable through normal client round-trips, because paths handed to the client derive from the configured root and preserve its case. Correcting it would require filesystem-capability detection, which is out of scope; documented instead.
- **The rename re-validation at `FileSystemService.js:122-123` is ineffective** — see the escalation below.

**Escalation (Phase 1) — `FileSystemService.rename` re-validation is a no-op.** The code converts the derived target to a client path and feeds it back through the forward conversion, commented `// throws if unsafe`. It cannot throw: for an outside-root target, `toClientPath` returns `'/'`, and `resolveSecurePath('/')` returns the root, which the new `targetPath === rootPath` branch correctly accepts. **Not a live hole** — `validateFileName(newName)` at `fs.controller.js:200` rejects `/`, `\`, and `..` immediately before, and `FileSystemService.rename` has exactly one caller. So filename validation is the effective barrier and this is defence-in-depth that does not work. Making it effective requires editing `FileSystemService.js`, outside Phase 1's file ownership, so it was escalated rather than silently absorbed. The affected spec scenario was rewritten to describe reality instead of asserting a control that does not exist.

### Frontend state model

Per-panel state machine, seven states:

```
loading ─→ success ─→ (poll) ─→ loading
   │           │
   │           └─→ partial     (some capabilities unavailable)
   ├─→ empty    (200, zero items)
   ├─→ unavailable  (null / flag says so — NOT 0)
   └─→ error    (request failed → polling stops)
```

Rules:

- No state fabricates a value. `unavailable` renders an explicit unknown marker, never `0`, `0.0%`, or `0 B of 0 B`.
- Backend-owned values are rendered as supplied. `max` is not recomputed; byte values are formatted, not rescaled.
- `dashboard.js:248,257` appends a literal `" GB"` with `Format.compact` and performs **no** byte conversion — hence the donut field is `valueGb` (gigabytes), not bytes. This is a unit mismatch surfaced honestly rather than papered over.
- Polling adopts the existing self-terminating interval pattern at `uploads.js:203-208` plus the existing `visibilityState` guard at `dashboard.js:76`. `dashboard.js:67-71` must stop swallowing the rejection before starting a timer.
- `escapeHtml` (`app.js:739`) exists and is currently used zero times on the Dashboard. All filesystem- and metadata-derived strings go through it.
- Reuse: `window.API` for all calls; existing `.skeleton` / `.empty-state` primitives; `Toast`/`Modal`/`Format`/`Icons` from `app.js`. **No `api.js` change.**

### Error handling

- Controller catches per-capability, degrades that capability, responds `200`.
- Only a total failure (route not mounted, unexpected throw) produces a non-2xx, via `AppError` → `errorHandler`.
- Messages are **static strings**. `errorHandler.js:20` ships `err.stack` (absolute OS paths) in non-production — pre-existing (R9), but this change must not *add* path interpolation, and its own error scenarios assert static messages.

The `200`-with-degradation convention is a deliberate, documented departure from the repository's all-or-nothing handler convention. It is recorded in `CONTRACTS.md`.

### Cross-platform considerations

| Concern | Rule |
|---|---|
| Separators | Native `path.sep` internally; forward-slash client paths accepted on both hosts; a client-supplied backslash is **not** a separator |
| Path resolution | Host's own `path.resolve`. No `if (win32)` branch anywhere |
| Root normalization | Trailing separator / redundant `.` in config normalized once at load, so the volume measured is correct |
| Link detection | `isSymbolicLink()` — uniform on both hosts |
| Directory size | Excluded — differs per host (0 vs block-sized) |
| `statfs` | Attempted unconditionally; no platform-name gate. Failure ⇒ unavailability |
| JSON safety | `statfs` returns `number`; `{bigint:true}` yields BigInt, which `JSON.stringify` rejects |
| Response | No drive letter, no backslash path, no UNC prefix, no platform field |

### Performance strategy

Unbounded recursion over an unknown-size tree, on an endpoint reachable without authentication, polled by a browser — the entry budget is a **security control**, not a nicety.

- **Entry budget: 100,000 entries. Time budget: 2,000 ms.** Both enforced; whichever trips first stops the walk. *(Approved as A3.)*
- Explicit stack; no recursion; no `Promise.all` fan-out (unbounded concurrency is its own hazard).
- Degradation is explicit: on budget exhaustion, return the partial result with a `truncated` flag rather than an error or a silent partial.
- **A truncated total is a wrong total, so the flag must reach the user.** Understating `treeBytes` is a fabrication risk of a different kind from the one this change exists to eliminate — presenting a partial aggregate as if it were complete. The flag is therefore surfaced in the UI, not merely present in the payload. This is why A3's values are a *starting point to be re-measured* (OQ1) rather than a permanent constant.
- **No caching architecture.** Not justified by evidence; a cache would add invalidation and staleness questions for a number that changes only when files change. Revisit only if measurement demands it.
- **Aggregation is not on the polled path.** Polling hits `/dashboard/health`; the summary is fetched on load and on explicit manual refresh.
- **Sizing is deliberately not a hard latency target** — the storage root does not exist in the verification environment, so any number would be invented. The budgets are structural; a sized target requires a real deployment and is listed as an open question.

### Testing strategy

`node:test`, zero dependencies (`package.json` `"type": "commonjs"`). Directories mirroring `src/`.

**Path security** — root, direct child, nested child, sibling-prefix (`download` vs `download-backup`), `..` traversal, `/media/../../download-2/x`, verdicts invariant across five root spellings, POSIX root, `toClientPath` round-trip and outside-root refusal, root-deletion sentinel still `403`, rename re-validation still `403`.

**Links** — junction to outside directory (Windows: junction, since unelevated `symlink('file')` is `EPERM`); link cycle to ancestor; broken link; link name absent from output.

**Aggregation** — regular files; nested dirs; empty dir (counted, contributes 0 bytes); directory size not counted; inaccessible subtree degrades while siblings survive; empty root; dotfile exclusion; budget exhaustion returns partial.

**Capacity** — valid reading; `bsize` read not assumed; `blocks`/`bavail` arithmetic; unavailable ⇒ nulls + `volumeAvailable:false` at 200; non-positive capacity ⇒ unavailable.

**Metadata** — `data/` created on first write; absent file yields empty default; fresh-checkout read succeeds; failed init retries and raises `AppError`; Top-N ordering; `max` supplied; zero-download excluded; result bounded; non-finite timestamp excluded.

**API** — bare object for summary; bare array for health; no `success`/`data` keys; mount ordering (summary 200, unknown `/api/dashboard/*` hits catch-all); `/api/health` unchanged; summary/health metric arrays deep-equal; no drive letter or backslash path in any payload; partial-failure 200s.

**Frontend** — unresolved and stated as such in Open Questions; recommended path is extracting pure logic from `dashboard.js` for `node:test` with zero dependencies, rather than installing a DOM harness.

---

## Decisions

### D1 — Mount `/api/dashboard` before the `/api` catch-all

*Rationale.* `server.js:35-37` is a two-argument middleware with no `next()` — it terminates the chain. Anything mounted after it is unreachable. `fs.routes.js` is mounted only at `/api/fs`, so `/api/dashboard/*` is already free.

*Alternative considered — remount `fs.routes.js` at `/api/dashboard`.* **Rejected**: it would expose all 8 filesystem routes (upload, rename, delete, folder-create, download, ZIP) under `/api/dashboard/*` on an unauthenticated server. Rejected by `AGENTS.md`'s layering rule and by principle of least authority.

*Alternative — restructure `server.js` routing.* Rejected: broad refactor not authorised by this feature's scope.

### D2 — Bare responses, not `{success, data}`

*Rationale — the client.* `api.js:71` returns the parsed body verbatim; there is no unwrap. `dashboard.js:57-62` reads top-level keys and `:79-80` hard-gates on `Array.isArray`. The client is correct; the endpoint does not exist yet, so nothing is broken by choosing bare.

*Rationale — the repository already does this.* An undocumented convention exists in `fs.controller.js`, verified by exhaustive read of its four `res.json` calls:

| Endpoint | Kind | Response |
|---|---|---|
| `GET /fs/tree` `:57` | read | `res.json([rootNode])` — bare array |
| `GET /fs/list` `:151-155` | read | `res.json({items, total, counts})` — bare object |
| `POST /fs/folder` `:184` | write | `success: true` |
| `PUT /fs/rename` `:218-219` | write | `success: true` |
| `DELETE /fs/delete` `:274-275` | write | `success: true` |
| `POST /fs/upload` `:383` | write | `success: true` |

Four envelope uses across exactly four mutating handlers; two bare responses across exactly two read handlers. `CONTRACTS.md:10` already gestures at the rule ("list/tree endpoints additionally return their own top-level shape") without stating it.

**Rule: read-only aggregate endpoints return a bare top-level shape; mutating endpoints return the envelope.** Both Dashboard endpoints are read-only aggregates, so they follow the established side.

*Alternative — wrap, and add unwrapping to `api.js`.* Rejected: modifies the hottest shared module to serve one feature, breaks with existing read-endpoint precedent, and `api.js` is the only client file this change must not touch.

*Consequence.* No exception is needed for the envelope. Task 7.2 instead **promotes the existing convention to a stated rule** in `CONTRACTS.md`, which is currently implicit. Note this is a documentation improvement, not a permission slip.

### D3 — No `DashboardService`

*Rationale.* `fs.controller.js:90-91` already composes multiple services in a controller. A `DashboardService` would be a new tier for two endpoints and would sit between the controller and the services the architecture rule already permits a controller to call.

*Alternative — `DashboardService` holding aggregation + DTO shaping.* Rejected: violates `AGENTS.md` rule 1 in spirit (services own fs access, controllers format), and creates a tier with exactly one consumer. Reopens only if Dashboard endpoints multiply.

### D4 — Skip links entirely; do not resolve-then-check

Covered in *Symlink / junction policy*. *Alternative — resolve link targets and apply containment.* Rejected: `stat` follows links so classification is impossible on that basis, and the walk still costs unbounded work. *Alternative — count link bytes at their own entry only.* Rejected as confusing; skipping is simpler and stated.

### D5 — `PathService` separator boundary, single resolution basis

Covered in *Security boundary*. *Alternative — `realpath`-based containment.* Rejected: mixing bases is itself a bug on case-insensitive volumes, and `realpath` fails on not-yet-existing paths (which `resolveSecurePath` must handle for create operations). *Alternative — `path.relative` containment.* Semantically equivalent and correct, but `startsWith(root + sep)` is the smallest change and the form already used in the file's intent.

### D6 — `bavail`-pinned capacity; nullable; HTTP 200

Covered in *Storage capacity strategy*. *Alternatives*: `bfree` (diverges from `bavail` ~20× on ext4 → inflated "used"); `blocks - bfree` (same problem); reading `statvfs` via a dependency (violates zero-dependency); platform-name gating (forbidden by cross-platform spec). *`bavail` is the only value with consistent cross-platform semantics.*

*Why 200 and not 503:* a Dashboard that cannot read volume capacity on one host is partially functional, not down. A 503 would make the whole panel error on a legitimate platform condition.

### D7 — Reuse `_extKey` in place

*Rationale.* `fs.controller.js:93-104` is the taxonomy already applied when listing a directory, and `CONTRACTS.md:199-205` documents it as a two-sided contract whose client map is already a superset. Moving it would be refactoring outside scope and would churn `fs.controller.js` — the second-hottest file in the graph.

*Consequence.* The aggregation method must reach the same taxonomy. Because `FileSystemService` may not import from a controller, the classification is exposed for reuse without relocating it. *If implementation reveals this forces duplication instead of reuse, that is an escalation point, not a licence to refactor* — see OQ3.

### D8 — `valueGb` for the donut; bytes everywhere else

*Rationale.* `dashboard.js:248,257` appends a literal `" GB"` to a `Format.compact` value with no conversion. The API primitive is bytes; this one field is gigabytes because the renderer is. *Alternative — change the renderer to format bytes.* Deferred: it is the correct long-term fix but widens the change surface into shared formatting. See OQ2.

### D8b - Health metrics: what could honestly be measured (Phase 5 findings)

Measured on the verification host while implementing P5:

- **`os.loadavg()` EXISTS on Windows and returns `[0, 0, 0]`.** The most dangerous
  finding of the phase. No error, no throw, no capability probe - the value is
  indistinguishable from a genuinely idle POSIX box, and it would render as a
  reassuring "0% load" on every Windows deployment. Platform-name gating is
  forbidden by the cross-platform contract and there is no portable way to detect
  the fake. **Therefore load average is not exposed at all.** Omitting it is the
  only honest option; reporting it would fabricate a healthy reading on exactly the
  platform family the requirement targets.
- **No `status` / `level` field on any metric.** There is no repository or platform
  source for memory or uptime thresholds, so asserting healthy/warning/critical
  would invent one. The frontend's hardcoded 60/80 thresholds (`dashboard.js:352`)
  are removed in P6 rather than being given a backend pretence.
- **Uptime is emitted in seconds, never percent.** It is a real duration.
- **Metrics delivered: `Memory used` (a real percentage of a real denominator) and
  `Uptime` (seconds).** Anything unsupported or failing is omitted, never zeroed.

### D8c - Where stale-metadata filtering lives

`MetadataService.getTopDownloads` ranks; it does not touch the filesystem. Stale
entries - metadata for a file that has since been deleted - are dropped by
`FileSystemService.retainExisting`, which resolves each path through `PathService`
and recomputes `max` over what survives. Filesystem access therefore stays in a
service (AGENTS.md rule 1) rather than appearing in the controller, and the bar
maximum always reflects the retained set rather than the global peak.

### D8d - Activity timestamps are sanitised at the source

`getActivities` drops entries whose `time` is missing, non-numeric, non-finite,
zero, or negative. It had zero callers before P5, so sanitising there makes the
guarantee hold for every future consumer rather than relying on each call site to
remember. A null timestamp renders as 1 January 1970 and a string renders as
`Invalid Date` - both fabrications, so they are removed rather than passed through.

### D15 - Frontend findings (Phase 6)

- **`Format.bytes` is 1024-based but labels its units SI.** Measured:
  `const k = 1024` with `['B','KB','MB','GB','TB','PB']`. A 500 GiB volume
  therefore renders as "500 GB", understating the true SI value by ~7.4%. This is
  **pre-existing and app-wide** - it also drives every file size in the listings -
  so correcting it inside P6 would be an unrequested change to app-wide formatting
  that diverges from what operating systems display. **Recorded, not changed.** The
  p6-contract mandates `Format.bytes(usedBytes, 0)` for the sidebar, which inherits
  the same convention rather than inventing a third one. Any future copy that
  claims a precise SI figure needs this resolved first.
- **The sidebar cannot avoid the tree walk.** Volume capacity is available only from
  `/api/dashboard/summary`, which performs the bounded recursive aggregation, so
  every page load now pays for it purely to fill a sidebar percentage. Accepted
  under the frozen contract and bounded at 100k entries / 2s, but it is the same
  class of concern as OQ5 and the natural fix is a cheap capacity-only endpoint.
- **Unavailability is decided in exactly one place.** The sidebar resolver
  `resolveStorageDisplay` returns early for every unavailable shape, so no second
  code path can compute a percentage from a null. Verified independently against
  16 hostile inputs (null, undefined, empty object, string, number, NaN, Infinity,
  negative, zero capacity, missing flag): all produce an explicit unavailable
  marker, none produce `0.0%` or `0 B of 0 B`. A genuine zero-byte reading against
  real capacity still renders `0.0%`, which is correct and is pinned by test so the
  dash can never be mistaken for zero.
- **Additive export beyond the contracted surface.** The sidebar decision logic is
  exported as `resolveStorageDisplay` / `resolveIdentityDisplay` in addition to the
  contracted `updateStorageUI` / "updateUserUI`. Necessary, not optional: these are
  classic scripts, so a module-scoped function is unreachable from `node:test` except
  through `window.AFM`. Recorded so the public surface is intentional rather than
  incidental.
- **Placeholder markup flashes before hydration.** The sidebar literals render on
  first paint and are only replaced once the fetch resolves. Removing them is split
  across three files by ownership, so the fix is correct but not atomic.

### D9 — `/api/health` untouched; `/api/dashboard/health` is separate

*Rationale.* `/api/health` (`server.js:28-30`) is documented live at `CONTRACTS.md:21`, returns `{success,message,env}`, has zero frontend callers, and serves liveness. Converting it would break its documented contract for no gain. *Alternative — one health endpoint.* Rejected: different consumers, different shapes, different semantics.

### D10 — Remove historical affordances; record no history

Covered in `specs/dashboard-historical-metrics/spec.md`. *Alternatives*: synthesise series — rejected, that is the fabrication this change exists to eliminate. Backfill from logs — rejected, `morgan('dev')` writes to stdout only, so there is no log source, and `docs/backend-checklist.md:42`'s "chart mock data or read from logs" is an admission that neither is honest. Begin recording now for future display — rejected as unrequested scope with no consumer.

### D11 — `node:test`, no dependency, no `engines`

*Rationale.* `ADR-001:97-98` already names `node:test` and `PathService` as security core. `statfs` needs Node ≥18.15, below the "Node LTS" intent at `ADR-001:61`. *Alternative — install a framework.* Rejected: violates zero-new-dependencies for no capability gain.

### D12 — Self-terminating polling; adopt the existing pattern

*Rationale.* `uploads.js:203-208` already implements the correct lifecycle and `dashboard.js:76` already guards on visibility. Copying the proven in-repo pattern beats inventing one. *Alternative — persistent interval with backoff.* Rejected: unbounded failing requests on an unauthenticated endpoint.

### D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep`

*Rationale.* `.gitignore:15-16` already anticipates the placeholder; it was simply never committed. `MetadataService` creating its own directory is the only arrangement that also works for a user who clones and runs. *Alternative — require manual `mkdir`.* Rejected: the app is already broken on a fresh checkout; making setup steps worse is not acceptable.

### D14 — Sidebar scope is all four pages

*Rationale.* The sidebar is duplicated 4× with no shared-layout mechanism, and `settings.html:1021,1194,1196` embed the fake `217` inside JavaScript, so a Dashboard-only fix would leave three pages lying. *Alternative — introduce a shared partial.* Rejected: no build step, no templating; that is a frontend-architecture change beyond this feature.

---

## Risks / Trade-offs

**R1 — `200` with per-capability degradation hides real failures.** → Mitigated by `volumeAvailable` and explicit nulls; documented as an intentional departure in `CONTRACTS.md`; each degradation path has its own scenario.

**R2 — Unmeasurable performance.** The storage root does not exist here, so no sized target. → Structural entry + time budgets with a truncation flag. A sized target is OQ1.

**R3 — Sidebar duplicated 4×.** Any literal missed in one page leaves a fabrication live. → Every occurrence enumerated with `file:line` in `tasks.md`; a repo-wide scan for the known literals is a checklist item.

**R4 — Frontend has no test harness.** → Extract pure logic for `node:test` with zero dependencies (OQ4). Extraction is scoped to pure functions only; no framework installed.

**R5 — `valueGb` is unit-inconsistent with the rest of the contract.** → Deliberate and documented; surfaced honestly rather than hiding it behind a silent conversion. Correct long-term fix is OQ2.

**R6 — The `PathService` fix changes behaviour of every existing call site.** Audited during Phase 1: **12 references** (8 `resolveSecurePath`, 4 `toClientPath`), not the 10 previously estimated. Every one passes either a client path rooted at `/` or a path derived from `resolveSecurePath` itself, so the stricter boundary only removes escapes. All 12 verified non-regressing.

**R7 — Reusing `_extKey` across a layer boundary.** → See D7 and OQ3; escalation point, not silent refactor.

**R8 — Docs contain a live Hyrum trap.** `docs/architecture.md:765` names `chartData` and `serverHealth`; renderers actually read `traffic` and `health`. → Corrected in the same change; listed in `tasks.md`.

**R9 — Pre-existing issues explicitly NOT fixed here** (documented so they are not mistaken for oversights): `errorHandler.js:20` ships `err.stack` (absolute OS paths) in non-production; fully open CORS (`server.js:18`); zero authentication; `.env` git-tracked with a real `STORAGE_ROOT` across 3 commits; fixed temp path in `_write` (concurrent-write corruption); `renamePath` overwrites download counts; client/server taxonomy drift.

**R10 — `data/.gitkeep` does not make the directory exist on a case-sensitive filesystem if git creates nothing.** → Bootstrap in `MetadataService` is the actual guarantee; `.gitkeep` is the convention, not the mechanism (D13).

---

## Migration Plan

No data migration. No schema change. No persisted-format change.

**Deploy order.** Prerequisite fixes first, then read paths, then write path, then frontend.

1. `node:test` runner wired (`package.json` only).
2. Metadata bootstrap + `data/.gitkeep` — independently shippable; repairs an already-broken fresh checkout.
3. `PathService` containment fix, both directions, with its regression suite **before** any aggregation code.
4. `FileSystemService` aggregation + capacity (additive, no caller yet).
5. `MetadataService` Top-N (additive, no caller yet).
6. `dashboard.routes.js` + `dashboard.controller.js`, mount before catch-all. Backend live, frontend unchanged.
7. Frontend: remove fabrications and historical affordances; wire real endpoints.
8. Docs + ADR-002.

Steps 4 and 5 are independently shippable with zero behaviour change. Step 6 adds endpoints without altering any existing route.

**Rollback.** Steps 1–5 are pure additions or self-contained fixes: revert the commit. Step 6 is one mount line. Step 7 is confined to frontend files. There is no state to unwind and no migration to reverse — the strongest available argument for this ordering.

**Verification before merge.** Full suite green; server boots and serves `/api/dashboard/summary`; `/api/health` byte-identical to its pre-change response; `git diff --stat` shows no change to `src/routes/fs.routes.js` or `src/controllers/fs.controller.js`.

---

## Open Questions

Genuinely deferrable — none of these changes the specs, the approach, or the task breakdown.

**OQ1 — Sized performance target.** What wall-clock latency is acceptable for a summary request? Requires a deployment with a real storage tree. *Does not block implementation:* budgets are already specified structurally.

**OQ2 — Should the donut renderer be migrated to byte formatting?** That would make the whole contract uniformly bytes and retire `valueGb`. Correct long-term, but widens the change into shared formatting. *Does not block:* `valueGb` is specified and documented.

**OQ3 — How is the file-type taxonomy shared across layers?** If exposing it for reuse from its current home proves to require duplication, the choice is between duplication and relocation. Escalate at implementation time. *Does not block:* `filesystem-aggregation` is specified in behavioural terms.

**OQ4 — Frontend test harness.** Pure-logic extraction under `node:test` versus a DOM harness. Recommended: extraction, zero dependencies. *Does not block:* no frontend behaviour in the specs depends on the harness choice.

**OQ5 — Node `engines` field.** Should one be added to pin the `statfs` floor? *Does not block:* `ADR-001:61` "Node LTS" already covers it; flagged for human approval.

---

## Human Approval Points

Marked in `tasks.md`. None blocks starting at P0.

| # | Decision | Status | Resolution |
|---|---|---|---|
| A1 | Nullable `usedBytes`/`totalBytes` with `volumeAvailable` flag | **APPROVED** | `null` + `volumeAvailable: false` at HTTP 200. Never zero-filled — `0` reads as a real measurement. |
| A2 | `bavail`-pinned `usedBytes` semantics | **APPROVED** | `usedBytes = bsize*(blocks-bavail)`. Only cross-platform-consistent choice: Windows `bfree === bavail`, ext4 diverges ~20×. |
| A3 | Entry + time traversal budgets | **APPROVED** | **100,000 entries / 2,000 ms**, whichever trips first. See *Performance strategy* for the honesty constraint this imposes. |
| A4 | Introducing `node:test` | **APPROVED** | Zero dependencies. `ADR-001:97` offers "node:test **or** Vitest"; the zero-dependency constraint selects `node:test`. |
| A5 | Adding a Node `engines` field | **DEFERRED** | Not added. `statfs` needs ≥18.15, below the "Node LTS" intent at `ADR-001:61`. Revisit under OQ5. |
| A6 | Creating `ADR-002` | **APPROVED** | `ADR-001:107-108` requires recording, never silent divergence. |
| A7 | `200`-with-degradation (failure semantics) | **APPROVED** | Genuine departure: no existing endpoint degrades per-capability. Documented as such in task 7.2. |

**Resolved 2026-10-03.** A5 is the only deferral, and it is a deferral rather than a rejection — the code remains correct on any Node meeting ADR-001's stated intent. None of the seven resolutions invalidates any spec, design decision, or task; D2's reclassification (envelope = precedent, not exception) was folded in beforehand.

**Note on A7's scope.** A7 concerns *failure semantics only* — that a partial-capability failure returns `200` with per-capability degradation rather than a non-2xx. It does **not** concern the response envelope. The envelope is settled by D2 as existing read-endpoint precedent and needs no approval; A7 was previously mislabeled as an envelope exception, which this correction fixes.
