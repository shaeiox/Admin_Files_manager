# ADR-002 — Dashboard Data Architecture: Real Aggregates, Typed Absences, Bounded Walks

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Project maintainer
- **Tags:** dashboard, api-contract, data-integrity, security, cross-platform

## Context

ADR-001 fixed the persistence model, the path boundary, and the layering
(`routes → controllers → services → fs`). It did not decide what the Dashboard is allowed to
*say*. The Dashboard shipped with mock figures, and the phase that replaced them ran into a
structural question the earlier ADR never had to answer: this application has no time-series
store, no snapshot table, and no log worth parsing. Every trend-shaped affordance the Dashboard
rendered — 14-day traffic charts, trend percentages, sparklines, period-over-period deltas — was
therefore reading from data that did not exist.

That forced an explicit position on what counts as a reportable number, and the position turned
out to be stricter than "compute some numbers":

- **Almost everything a dashboard wants to show is unavailable on some host.** `os.loadavg()`
  exists on Windows and returns `[0, 0, 0]` — a plausible-looking reading with no error to
  detect. There is no portable capability probe, and `AGENTS.md` forbids platform gating, so a
  Linux metric cannot be probed into cross-platform honesty.
- **Capacity arithmetic is the easiest thing in the codebase to get silently wrong.**
  `fs.statfs` reports `bsize`, `blocks`, `bavail`, and `bfree`; four plausible combinations
  produce four different answers, and each is wrong somewhere.
- **The tree walk is unbounded work on an unauthenticated endpoint.** There is no auth (a
  pre-existing condition, recorded in ADR-001's follow-ups), so `GET /dashboard/summary` is
  reachable by anyone who can reach the port, and a deep or wide tree must not be able to hang
  it.
- **Path containment was correct but incomplete.** `toClientPath` returned a plausible client
  path for absolute paths outside the root, and `FileSystemService.rename` derived a target
  path whose containment check could never throw. Both were silent no-ops that happened to be
  masked by upstream filename validation.
- **The response-envelope convention was documented wrong.** `CONTRACTS.md` claimed success is
  always `{success, data}`, which is true only of mutating endpoints; read-only aggregates have
  always returned bare payloads.

Options weighed for the dashboard's data source:

1. **Real aggregates with typed absences** (chosen) — every figure is measured at request time;
   anything unavailable is reported as an absence (`null`, `false`, omitted) rather than a
   plausible stand-in.
2. **Keep the mock and style it as demo data** — zero risk of a wrong number, because there are
   no real numbers. Rejected: the operator cannot tell a mock from a measurement, which is the
   failure mode this ADR exists to end.
3. **Start retaining history to make trends honest** — a snapshot store or append-only metrics
   file would make every trend chart real. Rejected as a scope inversion: it adds a second
   persistence surface with its own backup, staleness, and migration story, in a project whose
   defining constraint is that the filesystem is the database.
4. **Fabricate a trend-shaped series on the fly** (deterministic pseudo-history) — keeps the
   charts pixel-identical. Rejected: indistinguishable from option 2, and harder to detect.

## Decision

1. **Three distinct storage quantities, never collapsed into one "storage used".** `treeBytes` is
   the summed size of regular files under `STORAGE_ROOT`; `usedBytes` is volume consumption; and
   `totalBytes` is volume capacity. `treeBytes` excludes directory entry sizes (0 on Windows,
   block-sized on ext4 — including it makes identical content report different totals per host),
   excludes dotfiles, and excludes links entirely. **Rejected:** collapsing `treeBytes` into
   `usedBytes` (rejected — they answer different questions; a 10 KB tree on a nearly-full volume
   would render as 99% used, which is true of the volume and false of the tree), and dropping
   `treeBytes` in favour of volume figures only (rejected — the operator's actual question is
   "how big is my content", and the managed root is usually a small slice of its volume).

2. **`bavail` is pinned over `bfree`, and `bsize` is used exactly as reported.** Usage is
   `bsize * (blocks - bavail)`; capacity is `bsize * blocks`. On Windows `bavail === bfree`, but
   ext4 reserves blocks for root and the kernel, so only `bavail` means the same thing on every
   supported host. `bsize` is **not** assumed to be a power of two, so multiplying by 1024 is
   forbidden — for `bsize = 1000` that inflates every figure by 1024×. The arithmetic lives in a
   pure function, `FileSystemService.computeCapacity`, so it is testable exhaustively without a
   syscall backdoor. **Rejected:** `bfree` (rejected — on ext4 it counts reserved blocks as
   free, so the app would over-report available space by exactly the reservation), and a
   hardcoded 512-byte assumption (rejected — see above).

3. **Unreadable capacity is `null`, `volumeAvailable: false`, and HTTP 200 — never `0`.** A
   degenerate or nonsensical `statfs` reading (`totalBytes <= 0`, negative counts, `bavail >
   blocks`, non-numeric or non-finite fields) degrades to explicit unavailability with no path
   detail exposed. **Rejected:** zero-filling (rejected — `0` reads as a measurement, and
   "0 bytes of 0 bytes used" renders as a healthy, empty-looking volume), and omitting the keys
   (rejected — `undefined` vanishes through `JSON.stringify`, so a consumer cannot tell "this
   platform cannot report capacity" from "this build forgot the field").

4. **Read-only aggregate endpoints return a bare top-level shape; mutating endpoints return the
   `{success, data}` envelope.** `GET /api/fs/tree` returns a bare array, `GET /api/fs/list` a
   bare object; `POST /api/fs/folder`, `POST /api/fs/upload`, `PUT /api/fs/rename`, and
   `DELETE /api/fs/delete` return the envelope. The two Dashboard endpoints are read-only
   aggregates, so they follow precedent — `GET /dashboard/summary` returns a bare object,
   `GET /dashboard/health` a bare array. This corrects the previous documentation, which stated
   the envelope as a universal success convention with the exception buried in a parenthetical.
   **Rejected:** wrapping only the new endpoints (rejected — two conventions on one API is a
   permanent tax on every consumer and needlessly diverges from `tree`/`list`, the endpoints the
   Dashboard data most closely resembles), and retro-fitting `tree`/`list` into the envelope
   (rejected — a breaking change to shipped endpoints, out of this phase's scope).

5. **HTTP 200 with per-capability degradation — the one genuine departure.** An unreadable
   subtree, an exhausted traversal budget, and an unavailable capacity reading each remove only
   their own contribution; no filesystem or volume capability is allowed to fail the whole
   response. This is recorded separately from decision 4 because it is a departure from
   *failure* semantics, not from response *shape*: every other handler either succeeds wholly or
   fails wholly. **Scope limit, stated deliberately:** degradation is *not* applied uniformly.
   `getSummary` awaits its four sources through a single `Promise.all`, and
   `MetadataService._read` throws `AppError('Metadata store could not be read', 500)` for a corrupt
   or unreadable store, so **metadata still fails the whole request with `500`** — a reader must not
   assume a `200` was impossible there. Extending degradation to metadata, or removing it from the
   others, is a per-capability decision that was not made here.
   **Rejected:** failing the whole summary if any source fails (rejected — an unreadable volume
   is a partial capability, not a server fault; one `EACCES` subtree would otherwise black out
   file counts, the donut, and the activity feed), and per-capability status codes (rejected — one
   status code cannot express a partially-valid aggregate, so clients would be left inferring
   validity from payload shape).

6. **No `DashboardService`; the controller composes existing services.** `getSummary` fans out
   over `FileSystemService.getTreeStats`, `getVolumeStats`, `getHealthMetrics`,
   `retainExisting`, and `MetadataService.getActivities`/`getTopDownloads`, and shapes the DTO in
   the controller — the same idiom `fs.controller.js` already uses. Services return raw values
   and never shape a response; controllers own DTO concerns. **Rejected:** a new
   `DashboardService` (rejected — it would have to hold filesystem access, DTO shaping, and
   colour constants in one module, inverting the ADR-001 layering that keeps shaping in
   controllers; the aggregation is pure composition of existing calls plus shaping that has no
   filesystem meaning of its own).

7. **Path containment uses a separator boundary in both directions, on a single resolution
   basis.** `PathService.resolveSecurePath` and `PathService.toClientPath` both compute
   `contained = target === root || target.startsWith(root + path.sep)` using the native
   `path.sep`, and both sides of every comparison come from the same `path.resolve`. The
   derived-target check in `FileSystemService.rename` applies the same boundary.
   **Rejected:** a bare string prefix (rejected — it treats a name-prefix sibling as contained:
   root `download` versus sibling `download-backup`); canonicalising only the root with
   `realpath` while leaving the target on `path.resolve` (rejected — it mismatches on
   case-insensitive volumes and throws on not-yet-existing paths, so containment would depend on
   creation order); and round-tripping the derived rename target through `toClientPath` and back
   through `resolveSecurePath` (rejected — it *cannot* throw: an outside-root target becomes `/`,
   which resolves to the root, which the `target === root` branch accepts. It was a silent
   no-op. Upstream filename validation is what actually blocks traversal; this check is defence
   in depth and now works). *Known accepted property:* containment is case-sensitive, so on a
   case-insensitive volume a differently-cased spelling of the root is denied. That fails closed
   — a false rejection, not a bypass.

8. **Symbolic links and Windows junctions are skipped entirely, via `Dirent.isSymbolicLink()`.**
   A link is not descended into, not counted as a file or folder, and not named. Files are sized
   with `lstat`, not `stat`, so an entry swapped for a link between `readdir` and the size read
   is revealed and skipped rather than followed out of the root. **Rejected:** `fs.stat`-based
   classification (rejected — `stat` follows links, so a junction is reported as an ordinary
   directory and its contents are double-counted through a second path); `realpath` plus a
   containment re-check (rejected — an extra syscall per entry on the hot path and still
   time-of-check-to-time-of-use exposed); and a separate `skippedLinks` bucket surfaced in the
   UI (rejected as *display*, retained only as a service diagnostic — surfacing it would put
   entries on screen that every number on the page excludes).

9. **Traversal is bounded at 100,000 entries and 2,000 ms, and exhaustion sets an explicit
   `truncated: true`.** The walk is iterative with an explicit stack — no recursion, so a deep
   tree cannot exhaust the call stack and budget enforcement has a single place to stop. The
   stack holds **client** paths only; native paths are built at the syscall boundary. The time
   budget is evaluated every 512 entries rather than per entry. Whichever budget trips first,
   the partial result is returned with the flag set. **Rejected:** unbounded recursion (rejected
   — stack exhaustion on a deep tree, and no single place to stop); returning `500` or letting
   the request hang when the budget trips (rejected — a large-but-legitimate tree is not a server
   fault, and the partial data is still true data); and silently returning the partial total
   (rejected — **a truncated total is a wrong total**, and presenting it as a right one is the
   exact failure mode this ADR exists to prevent).

10. **No history is retained, so every historical affordance was removed rather than
    fabricated.** There is no time-series store, no snapshot table, and `morgan('dev')` writes to
    stdout only — nothing to parse and nothing retained. Consequently there is no `trend`,
    `trendPercent`, or `delta` field; `stats[].trendAvailable` is always `false`; the traffic
    chart, `renderChart`, and `renderLegend` were deleted outright; and every figure the
    Dashboard shows is **instantaneous**. **Rejected:** adding a snapshot store to make the
    trends honest (rejected — a second persistence surface with its own backup, staleness, and
    migration story, contradicting the filesystem-as-database constraint); parsing Morgan output
    (rejected — unstructured, unretained, and not queryable); and keeping the charts fed by
    generated series (rejected — that is option 4 in the Context table, i.e. fabrication).

11. **Load average is omitted entirely.** `os.loadavg()` is not reported on any platform.
    **Rejected:** calling it unconditionally (rejected — on Windows it returns `[0, 0, 0]`, so a
    fabricated reading would be published as a healthy `0%` with no error anywhere to detect it);
    gating on `process.platform === 'win32'` (rejected — forbidden by the cross-platform
    contract); and feature-detecting "a nonzero reading" as a capability signal (rejected — an
    idle Linux machine and an unimplemented call are indistinguishable).

12. **Zero is a real reading; statistics are never floored.** An empty `STORAGE_ROOT` reports `0`
    files, `0` folders, and `0` bytes. `stats[].value` is always the true measurement and may
    legitimately be `0`. **Rejected:** `Math.max(1, n)` flooring (rejected — this is what an
    earlier revision did, and it reported 1 file, 1 folder, and 1 byte for an empty tree, which
    is a fabrication of three separate numbers); and dropping zero-valued entries from `stats[]`
    (rejected — cardinality would then vary with the data, so a consumer could not index by
    position and "0 files" would become indistinguishable from "no data").

13. **The health payload carries no `status` or `level`, and omits any metric the platform does
    not back with a real reading.** `health[]` is `{name, value, unit, icon}`; uptime is expressed
    in **seconds** because it is a duration, not a ratio. **Rejected:** a
    `healthy`/`warning`/`critical` field (rejected — there is no repository or platform source
    for memory or uptime thresholds, so any threshold would be invented, and the field would then
    assert a judgement the application has no basis for); and emitting unsupported metrics as `0`
    (rejected — see decision 3: `0` reads as a measurement).

## Consequences

**Positive**

- Nothing fabricated reaches the UI. Every absence is typed as an absence — `null`,
  `volumeAvailable: false`, `trendAvailable: false`, `truncated: true`, or an omitted metric
  row — so "we don't know" is always distinguishable from "it is zero".
- The capacity formulas are a pure function, so the class of bug that is hardest to catch
  (platform-dependent arithmetic) is covered by ordinary unit tests with no disk fixture.
- The donut and the file list agree by construction: both classify through
  `src/utils/fileTypes.js`, so a file cannot be counted as `document` in one view and `other` in
  the other.
- Failures are scoped. An unreadable subtree becomes a recorded diagnostic, not a `500`; a
  rename's defence-in-depth containment check now actually throws.
- The walk's worst case is a stated constant, so the endpoint's cost is a property of the design
  rather than of whatever the operator happens to point `STORAGE_ROOT` at.

**Negative / accepted trade-offs**

- **The sidebar pays for the bounded walk.** Capacity is only available from
  `GET /dashboard/summary`, because `GET /dashboard/health` has no configured-root context and
  deliberately omits capacity-dependent metrics. The sidebar volume card therefore calls
  `/dashboard/summary` on every page load and pays for a full tree walk to read two numbers.
  Accepted rather than worked around with a second endpoint: a capacity-only endpoint would
  duplicate the volume logic and split the contract. The budgets bound the damage.
- **The payload mixes units.** The donut carries `valueGb` (gigabytes, `1e9` divisor) while every
  other byte quantity in the contract — `treeBytes`, `usedBytes`, `totalBytes`, `bytes` — is in
  bytes. `valueGb` is in gigabytes because the renderer appends a literal `" GB"` suffix to a
  compact-formatted number and performs no conversion of its own. `bytes` travels alongside
  precisely so the breakdown still reconciles exactly with `treeBytes` and so the filter can
  test raw bytes rather than a rounded GB figure that would drop every category below ~1 MB.
  Accepted: the alternative is editing the renderer, which is outside this phase's ownership. The
  mixed unit is documented at every occurrence and must not be "tidied" on one side only.
- **Every figure is instantaneous.** Refreshing gives new numbers, never deltas. An operator
  cannot answer "is my storage growing?" from this screen at all, and the removed charts cannot
  be restored without a retention decision this ADR deliberately did not make.
- **`stats[]` rounds; `storage` does not.** `stats[].value` for `volume` is whole gigabytes
  (`Math.round`) while `storage.usedBytes` and `storage.totalBytes` keep full precision. Two
  numbers on the same page therefore differ in the last digits, by design: the stat tile is for
  reading at a glance, the payload is for arithmetic.
- **A large tree reports `truncated: true`.** At 100,000 entries or 2,000 ms the totals are
  partial, and the UI must surface that flag rather than style it away. A truncated dashboard is
  honest; a silently truncated one is not.
- **Case-sensitive containment causes false rejections.** On a case-insensitive volume, a
  differently-cased spelling of the root is denied with `403`. Accepted: it fails closed, and
  loosening the comparison to a case-folded prefix would reintroduce the prefix-matching bug this
  ADR closes.
- **Two health endpoints with different shapes.** `/api/health` returns
  `{success, message, env}` and is consumed by the sidebar identity block;
  `/api/dashboard/health` returns a bare array of metric objects and is polled by `dashboard.js`.
  A client must know which one it wants. Accepted: `/api/health` is a boot/environment probe and
  is byte-identical to what it was — it was **not** repurposed.
- **An operator on a busy Linux host loses the load-average signal** they may expect a server
  dashboard to show, with no opt-in. Accepted: a correct Windows implementation is worth more
  than a metric that lies on half the supported platforms.
- **`stats[].totalGb` is an optional field**, present only on the `volume` entry, because it only
  exists when capacity was readable. Consumers must read it conditionally.

**Follow-ups (tracked, not blocking)**

- `test/api/dashboard.contract.test.js:151` still asserts `stat.value >= 1` with the comment
  "the renderer rounds each frame" — the flooring rule this ADR removed (decision 12). It passes
  only because the fixture tree is non-empty. Tighten it to assert the true reading, including
  the empty-tree case.
- The docblock at `src/controllers/dashboard.controller.js:41-43` still states "Every `value` is
  a raw JSON number of magnitude >= 1"; the inline comment ten lines below correctly states the
  opposite. The docblock is stale.
- Collapse `fs.controller.js`'s inline `_extKey` taxonomy onto `src/utils/fileTypes.js`. It is a
  ~12-line removal that was deliberately left alone because the file is outside this phase's
  ownership; until then the two server-side copies can drift.
- Uncomment `POST /api/fs/download-zip` in `fs.routes.js`. The controller exists and is exported;
  `API.downloadZip` posts to the route, which currently 404s.
- `MetadataService.js` has a corrupted comment around line 178 (`a \netain predicate`) left by an
  earlier edit. Cosmetic — it is still inside a block comment — but it should be repaired.
- If the bounded walk ever becomes a measurable cost, the fix is a cached summary behind an
  explicit freshness contract, not a looser budget.
- Decide whether the metadata capability should degrade like the filesystem and volume ones do.
  Today a corrupt `data/metadata.json` takes down the entire summary via `Promise.all`, which is
  inconsistent with decision 5 for every other capability. Either catch per-source or state the
  asymmetry as permanent.

## References

- `src/controllers/dashboard.controller.js` — DTO shaping, colours, the bare payload, and the
  per-capability degradation rules
- `src/services/FileSystemService.js` — `getTreeStats` (bounded walk), `computeCapacity`
  (pinned `bavail`), `getVolumeStats`, `getHealthMetrics`, `retainExisting`
- `src/services/PathService.js` — separator-boundary containment in both directions
- `src/utils/fileTypes.js` — the single server-side file-type taxonomy
- `test/api/dashboard.contract.test.js` — the executable form of this contract
- `docs/CONTRACTS.md` — the API surface this decision constrains
- `openspec/changes/dashboard-real-data/p7-facts.md` — verified facts captured from the running
  server that this ADR was written against
- `docs/decisions/ADR-001-architecture-baseline.md` — the layering and path boundary this
  decision extends

> When a change invalidates any statement above, update this ADR or open a superseding one — do not
> silently diverge.