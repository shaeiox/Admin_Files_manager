# Design

## Context

See `proposal.md` — Why. The verified facts that shape the approach:

**Mount semantics.** `server.js:50-52` registers `app.use('/api', handler)` where `handler` is a
**two-argument** middleware that never calls `next()`. It therefore terminates the chain. This is
already documented as a load-bearing constraint in `dashboard.routes.js:14-16` and `server.js:36-46`.
Any new prefix must be mounted before it, or it is permanently unreachable.

**Frontend egress.** `api.js:18` is the only `/api` literal in the frontend. 30 call sites across 8
modules go through `window.API`. Only two `fetch` sites exist: `api.js:49` and `router.js:60`. The
latter retrieves static page markup for client-side navigation (ADR-005) and is explicitly not an API
call.

**One URL leak.** `files.js:657` builds a thumbnail URL by concatenating `window.API.BASE_URL` with a
literal path, for use as an `<img src>`. This is the only place the frontend knows the server's URL
layout. It exists because an `<img src>` cannot go through `fetch`.

**Two prefixes today, one endpoint outside a router.** `/api/health` is an inline handler in
`server.js:30-32`, not a route in a module. A versioned `/api/v1/health` therefore needs either that
handler extracted or the assembly to accept it.

**Test coupling is the migration cost.** ~160 hardcoded `/api/...` path literals across 10 test files.
Roughly a third of those are **negative** assertions — `/api/dashboard/upload`, `/api/dashboard/rename`,
`/api/dashboard/delete`, `/api/dashboard/star`, `/api/dashboard/download`, `/api/dashboard/tree`,
`/api/dashboard/list`, `/api/dashboard/nope`, `/api/does-not-exist` — proving the filesystem router
is *not* remounted under the dashboard prefix. These are security-relevant and must be reproduced for
the versioned prefix, not merely updated.

**Taxonomy, verified.** Server-authoritative for all data-affecting classification (`fs.controller.js`
`getList` ships `type` per item; `counts` computed server-side; filtering is a server query
parameter). Client table is display-only: a fallback at `files.js:263` and labelling of not-yet-uploaded
local files in `uploads.js` (lines 339, 548, 1293). Set equality is enforced by
`test/utils/fileTypes.test.js`.

**No `kind` is emitted.** Zero occurrences of `kind` in `src/`. `api.js:95-100` already attaches
`err.kind` when — and only when — the server sends a string. `docs/CONTRACTS.md:407-425` documents
this honestly. The field is already reserved in practice.

## Goals / Non-Goals

**Goals**

- `/api/v1/*` reachable, byte-compatible with today's `/api/*`, for every existing endpoint.
- One assembly of router instances mounted at both prefixes, so drift is structurally impossible.
- `API.BASE_URL` resolved from configuration with a same-origin `/api/v1` default.
- Every API URL, including the thumbnail `<img src>`, built inside the boundary.
- Error contract pinned by tests and documented; no behaviour change.
- Test additions that are **additive** — existing assertions keep passing unchanged.

**Non-Goals**

- Removing, renaming or reshaping any endpoint.
- Emitting `kind` from any endpoint (the field is reserved, not populated).
- Any origin split, CORS change, authentication, bundler, framework or TypeScript.
- Touching `type-taxonomy-consistency` or adding `GET /api/v1/fs/file-types`.
- Changing any service, controller or validator behaviour.

## Decisions

### D1 — Version is a mount prefix; route modules stay version-agnostic

`api.js` (the client) and the routers declare no version. Version is applied only at the mount site.

**Why:** a router that knows its version must be duplicated per version. A router that does not can be
mounted at N prefixes for free. This is what makes "both prefixes always behave identically" true by
construction rather than by discipline.

**Alternatives rejected.** *Header-based versioning* (`Accept-Version`): invisible in access logs, easy
to omit, and the SPA would have to set it on every request including the `<img src>` and the iframe
downloads — all of which cannot set headers. *Query-parameter versioning*: pollutes caches and every
download URL. *Per-version route files* (`routes/v1/fs.routes.js`): exactly the duplication this
change exists to avoid; a v2 would fork 14 declarations.

**Consequence:** the version segment cannot be produced by a route module, so `api-versioning`'s
"The version segment precedes the resource segment" is enforced at mount time only. That is
sufficient — the assembly is the single place a prefix is attached.

### D2 — One assembly module, mounted twice

New `src/routes/api.js` exports a router that composes the health handler plus the three existing
routers:

```
/api/v1  ─┐
          ├─→ api.js assembly ─→ health handler
/api     ─┘                        ├─ fsRoutes
                                   ├─ dashboardRoutes
                                   └─ settingsRoutes
```

Both mounts reference the **same router instances**. `/api/health` moves out of `server.js` into the
assembly so the versioned prefix serves it too.

**Why:** the alternative — mounting each existing router a second time at `server.js` — works but
scatters the surface definition across the file whose ordering is already the most fragile part of the
server, and makes "which prefixes exist" a question about `server.js` rather than about one module.

**Ordering in `server.js`, in this exact sequence:** static → `cors`/json/urlencoded/morgan →
`app.use('/api/v1', apiSurface)` → `app.use('/api', apiSurface)` → `app.use('/api', notFound)` →
frontend fallback → `errorHandler`.

`/api/v2/...` matches neither mount, falls through to `notFound`, and gets the JSON 404 envelope — it
is not served by v1 and not answered with the SPA shell (the frontend fallback excludes `/api`).

**Why not put version detection in middleware?** A middleware that rewrote `req.url` from `/api/v2/x`
to `/api/v1/x` would silently serve a newer client from an older contract — the precise failure
versioning exists to prevent. Explicit mounts make a future v2 an intentional act.

### D3 — Legacy `/api/*` is an alias, retained, with removal gated on authentication

**Why retained:** the test suite's ~160 path literals, and any browser tab or bookmark in use, point at
`/api/*`. Withdrawing them in the same change that introduces versioning would make a revert require a
code deploy rather than a config edit.

**Why removal is gated on authentication** (not on a date or on "v1 has shipped"): removing an alias
reduces the number of URLs pointing at an unauthenticated API by exactly zero. The same handlers
remain reachable at `/api/v1`. ADR-003 already records that the exposure is closed by authentication,
not by URL shape. Treating alias removal as a security action would misrepresent it as one.

**Consequence:** `legacy-api-compatibility` requires that removal "is deferred, because removing an
alias does not reduce the exposure that authentication is required to close" — recorded, not resolved.

### D4 — `BASE_URL` resolution: explicit override, else `/api/v1`, resolved once

Resolution order at module evaluation:

1. `window.AFM_API_BASE` — a global set before `api.js` loads (works with no HTML edit; the seam a
   future reverse-proxy or split deployment uses).
2. `<meta name="afm-api-base" content="…">` in the document head — the declarative, no-build form.
3. `'/api/v1'` — the same-origin default.

Then: trim; if empty, fall through to the default; strip trailing `/`. Exposed as `API.BASE_URL`.

**Why a meta tag rather than a `data-` attribute on the script element:** four page shells, each with
its own `<script>` list, and a test asserts the sidebars are byte-identical. A head `<meta>` is one
line per shell, cannot drift out of sync with the script list, and is inert when absent. The global is
the lower-friction option for a later origin split and needs no markup at all.

**Why resolved once, not per request:** per-request resolution would make a mid-session config change
silently split one document's traffic across two hosts. Resolving once keeps every URL in a document
consistent, which is what `api-client-boundary`'s "Resolution happens once" requires.

**Default is `/api/v1`, not `/api`.** This makes the frontend a v1 consumer immediately. Keeping `/api`
would mean shipping a client that had to be edited again at the next version.

**Forward-compatibility of the resolver:** read the override exactly once, at load; expose the value as
a frozen constant. A future split deployment sets `AFM_API_BASE` once and nothing else changes. Because
the default stays root-relative, a split deployment remains a *configuration* change with no source
edit — which is the capability this change is buying.

### D5 — URL construction moves inside the boundary

New `API.thumbnailUrl(clientPath, size)` builds the preview URL from the resolved base. `files.js:657`
calls it instead of concatenating.

`downloadFile` / `downloadMultipleFiles` / `downloadZip` already build their URLs inside `api.js`; they
are unchanged and are now *covered* by a test asserting they carry the resolved base.

`router.js:60` is **not** changed: it fetches `/files.html`, a static page shell, not an API endpoint.
It uses a relative path with `credentials: 'same-origin'`. `api-client-boundary`'s "Static page
navigation is not an API call" records this exclusion explicitly so a future reviewer does not read it
as a missed case.

**Why not `API.url(path)` as a general escape hatch:** it would re-create the leak with extra steps —
any consumer could hand-build a path again. One named builder per non-`fetch` transport (image) is
enough, because the fetch transports are already internal.

### D6 — Error contract: pin what exists, reserve `kind`, emit nothing

The envelope stays `{ success: false, error }`. No endpoint changes. This change adds:

- a **spec** stating the envelope, the status meanings, the no-disclosure rule and the `kind` format;
- **tests** that assert the existing behaviour on the versioned prefix, so it cannot drift;
- a documented statement that `kind` is reserved and currently always absent.

**Why not start emitting `kind`:** it would require auditing all 14 endpoints to decide a taxonomy,
changing observable payloads, and touching `uploads.js` — which is owned by an in-progress change.
`api.js` already honours `kind` when present, so emitting it later is genuinely additive and needs no
client change. Reserving the field now and populating it later is the smaller, safer sequence.

**Why restate the no-disclosure rule in a new capability rather than widening `filesystem-security`:**
`filesystem-security`'s requirement is scoped to *Dashboard* responses; widening it would modify a
capability owned by an already-archived change and blur a security capability into an API-shape one.
`api-error-contract` states the all-endpoint rule and cross-references it.

### D7 — No `GET /api/v1/fs/file-types`

Detailed in `proposal.md` — Taxonomy. Three independent reasons:

1. **It would not reduce real coupling.** The server already classifies authoritatively; the client copy
   is display-only.
2. **It would modify a capability owned by an unarchived change.** `type-taxonomy-consistency` (owned
   by `files-page-correctness`, 87/87 complete but **not archived**) pins the two-copy agreement as a
   regression requirement. A delta against it is not expressible until that change is archived.
3. **It would trade a guaranteed invariant for a network dependency.** Embedded table: always
   available. Fetched table: a new failure mode where a failed request means no file badges at all —
   strictly worse in a same-origin, single-deploy architecture.

Revisit only when a second, independent consumer needs the taxonomy — at which point the endpoint is
right, and it should ship in v1 from the start.

### D8 — Additive-only compatibility rule, stated as a rule not a date

Within v1: new endpoints, new optional response fields, new optional parameters that default to
current behaviour. Removals and retypes go to v2. There is no scheduled date for v2 and no
deprecation-window mechanism, because there is currently nothing to deprecate — v1 is new and the
legacy alias is documented as retained.

**Why no header-based deprecation signalling:** nothing is being deprecated in this change, and adding
`Deprecation`/`Sunset` headers now would be machinery with no consumer — the same "affordance with no
source" failure mode `AGENTS.md` prohibits.

## Risks / Trade-offs

**[Two prefixes double the URL surface an attacker may probe]**
→ Mitigation: the prefix is an alias, not new capability. The reachable *handler* set is identical
(`legacy-api-compatibility`: "The alias adds no capability"). No new endpoint, no new mutation. ADR-003's
exposure is unchanged, and is closed by authentication, not by URL count. Recorded, not mitigated here.

**[`/api/v1/*` silently unreachable if mounted after the catch-all]**
→ Mitigation: the ordering constraint is a requirement in `api-versioning` and is asserted by a
source-level mount-order test, mirroring the existing precedent in
`test/api/settings.contract.test.js` and the reasoning already recorded in `server.js:36-46`.

**[Double-mounting the same router instance misbehaves under Express 5]**
→ Mitigation: routers are plain middleware and are re-entrant across mounts; verified by a live-server
test asserting both prefixes answer for the same endpoint in one server instance. If it does not hold,
the fallback is two `express.Router()` wrappers delegating to shared controllers — but that must be
proven by a test, not assumed.

**[Changing the client's default base from `/api` to `/api/v1` breaks every frontend test that asserts a request path]**
→ Mitigation: frontend suites stub `window.API`, so they assert *that a call was made*, not the URL —
verified across `test/frontend/*`. The exposure is in `test/api/*` and `test/integration/*`, which hit
real paths; those keep testing the legacy prefix (proving the alias works) and gain **new** cases for
the versioned prefix. **No existing test assertion is edited.**

**[An already-open browser tab holds a stale client after deploy]**
→ Mitigation: this is the compatibility model's reason to exist. The legacy prefix keeps serving, so a
stale tab still works indefinitely. This is the concrete payoff of D3.

**[`kind` reserved but never sent leaves a spec'd field with no producer]**
→ Mitigation: the spec states absence is valid and forbids inferring a kind. `api.js` already treats it
as optional. Documented as reserved-not-emitted rather than implied to exist.

**[Four page shells gain a `<meta>` line; sidebar byte-identity test is sensitive]**
→ Mitigation: the meta goes in `<head>`; the sidebar assertion covers sidebar markup only. Verified by
running `test/frontend/navigation.test.js`.

**[Scope creep toward the auth change ADR-003 demands]**
→ Mitigation: `api-error-contract` and `api-versioning` are both expressible without auth. The spec
files contain no authentication requirement. Authentication stays a recorded prerequisite (§7).

**[Taxonomy deferred and the deferral is wrong]**
→ Mitigation: the deferral is cheap to reverse — adding one read-only endpoint is a small additive
change to v1, permitted by the compatibility rules in D8. Deferral costs little; doing it now would
have conflicted with an active change and added a runtime failure mode.

## Migration Plan

Deploy is a single server restart plus static asset replacement. There is no data migration, no schema
change, no state change, and no backfill.

| Stage | Action | Verification |
|---|---|---|
| 1 | Add `src/routes/api.js`; mount at `/api/v1` before the catch-all; move `/api/health` into the assembly | Both prefixes answer; mount-order assertion |
| 2 | Add `API.thumbnailUrl()`; repoint `files.js:657` | Thumbnail renders; existing file tests green |
| 3 | Add `BASE_URL` resolution + `<meta>` to 4 shells; default `/api/v1` | Default is same-origin; override honoured; all pages functional |
| 4 | Add contract + compat + boundary tests (additive only) | `npm test` green with **zero edited assertions** |
| 5 | Update `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `AGENTS.md`, add ADR-007 | Docs match implementation; `repo-guardrails` green |
| 6 | `graphify update .` | Command completes |

**Ordering constraint:** stages 1–2 are server-only and independently shippable. Stage 3 is the first
point at which client behaviour changes, and it is the point of no return for the *default* base URL —
but not a risk, because stage 1 already guarantees the legacy prefix still serves.

**Rollback.** Configuration-only: reset `API.BASE_URL` to the legacy prefix (or remove the `<meta>`,
which falls back to the current default). No server rollback, no data step. Because both prefixes are
served by the same unchanged handlers, the server side needs no rollback at all. This is asserted by
`legacy-api-compatibility`'s rollback requirements rather than merely described.

**Deprecation.** None in this change. The legacy alias is documented as retained; its removal is a
separate change gated on authentication (D3).

## Security Analysis

**Mandatory review against ADR-003.** ADR-003 records two Critical findings — no authentication, and
`cors()` admitting any origin — at the same severity *because together they let any page the operator
visits drive every mutating endpoint*. Its recorded follow-up is to restrict origins, or drop CORS
entirely for a same-origin SPA, in the same change as authentication.

**This change does not touch CORS.** `app.use(cors())` stays exactly as it is. The shipped configuration
keeps every request same-origin and root-relative (D4), so the browser never needs cross-origin
permission and no `Access-Control-Allow-Origin` header is required for the frontend to work. Widening
CORS is not used as a decoupling mechanism anywhere in this design.

**Threat model for the operations in scope.** Upload, delete (`fs.rm` recursive, permanent), rename,
folder creation, star, ZIP download and thumbnail are all reachable unauthenticated, before and after
this change.

| Threat | Effect of this change |
|---|---|
| Any web page the operator visits drives a mutating endpoint | **Unchanged.** No new endpoint, no new capability, no CORS change. Alias removal is explicitly deferred as non-mitigating (D3) so this change never masquerades as closing it. |
| A second prefix is used to slip a route past review | **Structurally prevented.** One shared assembly (D2); route modules carry no version (D1); a guardrail asserts no filesystem mutation is reachable under any dashboard prefix — extended to the versioned prefix. |
| Path traversal via a versioned endpoint | **Unchanged.** Same handlers, same `PathService.resolveSecurePath` choke point, same validators. The version prefix adds no new path-consuming code. |
| Error responses disclose the on-disk layout | **Unchanged and now specified for all v1 endpoints**, not only Dashboard (`api-error-contract`). No stack, no path, no raw errno, in any environment. |
| A stale client is used against a changed contract | **Improved.** Legacy prefix retained, so a pre-existing tab keeps working (D3). |
| Sensitive filesystem values leak into a new endpoint | **N/A.** No new endpoint. The only added surface is `/api/v1/*`, an alias of the existing surface. |

**What remains unsafe until ADR-003's authentication prerequisite lands.** Everything Critical in
ADR-003: no authentication on any endpoint, `cors()` admitting any origin, and CSP disabled. Adding a
second prefix does not improve any of them, and this change does not claim to. Until authentication
exists, this service must not be reachable beyond localhost — unchanged from today.

**Recorded dependency.** Authentication is a **prerequisite for** (a) removing the legacy alias
(D3), and (b) any future origin split, because a split requires CORS and wide-open CORS on an
unauthenticated API is strictly worse than same-origin. This change is designed so that neither is
blocked by it: both become configuration changes once authentication lands.

## Concurrent Changes And Ownership

Verified against the working tree (`git status` clean, on `master`) and `openspec list`.

| Change | State | Overlap with this change |
|---|---|---|
| `upload-pipeline-correctness` | **in-progress** 107/109 | **Owns `public/assets/js/uploads.js`.** Its 2 open tasks are a browser pass (9.8) and a final check. This change must touch 5 API call sites in `uploads.js` (lines 587, 630, 695, 1260, 1379). **Conflict.** |
| `settings-page-correctness` | **in-progress** 23/25 | Task 5.4 is **BLOCKED** precisely because `uploads.js` is owned by the above. This change editing `uploads.js` risks invalidating that gate. **Transitive conflict.** Also edits `docs/CONTRACTS.md` (task 6.1, done). |
| `files-page-correctness` | **complete** 87/87, **unarchived** | Owns capability `type-taxonomy-consistency`, which pins the two-copy taxonomy invariant as a regression requirement. **Not modified by this change** — D7 defers the taxonomy endpoint precisely because of this. Also edits `docs/CONTRACTS.md`. |
| `notification-panel-and-tooltip-placement` | **complete** 13/13, **unarchived** | Owns `notifications.js`, which has one `window.API.get('/dashboard/summary')` call site. Minor edit; low risk. |
| `dashboard-real-data` | **archived** | Owns the 9 main specs. `dashboard-api` is modified here by explicit delta. |

**Mitigation, recorded rather than assumed:**

1. **Gate Phase 3 on `upload-pipeline-correctness` archiving.** The `uploads.js` call sites are path
   updates only and are mechanically safe, but the file is actively owned. Sequencing after the owner
   finishes avoids an edit conflict in a file another change is mid-way through.
2. **Do not touch `settings.js`.** Its two call sites follow `BASE_URL` automatically — no per-file edit.
3. **`docs/CONTRACTS.md` is serialized.** Three changes have edited it. All edits here are additive
   (new namespace section, error contract, compatibility rules); do not restructure existing sections
   that another change may be mid-edit on.
4. **`server.js` has no active owner** (last edited by the now-archived dashboard change and the
   completed settings task 2.2), so mounting there is safe.
5. **Re-run `openspec list` before Phase 3** — if `files-page-correctness` has archived in the interim,
   D7 is still correct, but the taxonomy capability becomes modifiable and the deferral should be
   re-confirmed rather than assumed.

## Open Questions

None that affect the specs, the approach, or the task breakdown.

Two items are recorded as *decisions* rather than questions, because guessing would have changed the
design: the taxonomy deferral (D7) and the alias-removal gate (D3). Both are reversible by a later
additive change and neither blocks implementation.

One genuinely deferrable item: whether `BASE_URL`'s override precedence should later prefer the `<meta>`
tag over the global, or support a third source such as a build-time constant. It affects
`api-client-boundary`'s resolution order only in its third step, not the requirements, and is better
settled when a real second deployment shape exists.
