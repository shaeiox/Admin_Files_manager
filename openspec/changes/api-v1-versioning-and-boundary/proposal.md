# Proposal

## Why

The HTTP surface is currently unversioned and therefore not safely changeable. Every endpoint lives
at a bare `/api/*` path with no way to evolve a response shape without silently breaking a browser
tab that is already open, and the frontend's single API module hardcodes that prefix as a literal, so
the coupling between "where the API lives" and "where the pages live" cannot be adjusted without
editing source.

The API needs a versioned namespace and an explicit, configurable client boundary **now**, while the
service is still single-operator, same-origin and unauthenticated — because that is the cheapest
moment to introduce both. Introducing them later means introducing them alongside the
authentication work that ADR-003 already records as a blocking prerequisite.

This change does not move the frontend to another origin, does not widen CORS, and does not
implement authentication.

## What Changes

- **A versioned API namespace is introduced at `/api/v1/*`**, assembled by one new route module so
  that the versioned and unversioned surfaces cannot drift apart.
- **`/api/v1/*` and `/api/*` resolve to the same router instances.** The legacy surface is retained
  as a compatibility alias, not deprecated-and-scheduled-for-removal in this change.
- **The API contract is pinned by tests and stated as a compatibility model**: within v1, changes are
  additive only; anything that removes or retypes a field belongs in a future v2.
- **The error envelope is specified as a stable contract**, including the already-reserved-but-never-
  emitted `kind` token. No endpoint changes its error behaviour in this change.
- **`API.BASE_URL` becomes resolvable configuration** with a same-origin default of `/api/v1`, so a
  future different-host deployment is a configuration change rather than an architectural one.
- **All URL construction moves behind the client boundary**, including the one existing call site
  that builds an API URL by string concatenation outside the API module.
- **The file-type taxonomy endpoint is deliberately NOT added.** See "Taxonomy" below.
- No endpoint is added, removed, renamed, or given a different response shape.

### Taxonomy: investigated, and deliberately excluded

The taxonomy duplication between `src/utils/fileTypes.js` and `FileTypes` in `public/assets/js/app.js`
was investigated and is **smaller than it appears**. Verified in the current code:

- The server is **already authoritative** for every classification that affects data. `fs.controller.js`
  `getList` computes `type: isFolder ? 'folder' : classifyFile(item.name)` per item and ships it,
  and `counts` are computed server-side. Filtering is server-side (`listQuery` sends `type` as a
  query parameter).
- The client table is used only for **display**: a fallback when `file.type` is absent
  (`files.js:263`, `file.type || AFM.resolveType(file.name).key`), and labelling files that exist
  only in the browser and have no server record yet (`uploads.js`, queued/dragged local files).
- Drift therefore **cannot corrupt filtering or counting today**; it could only mis-badge an edge case.

Adding `GET /api/v1/fs/file-types` would not reduce risk — it would **increase** it. It would require
modifying `type-taxonomy-consistency`, a capability owned by the unarchived `files-page-correctness`
change, whose regression requirements deliberately pin the two-copy agreement as a *test-enforced*
invariant. It would also replace an embedded table (always available) with a network dependency
(a new failure mode: the fetch fails → no badges at all), which is strictly worse while the frontend
and API share one origin and one deploy.

**Recommendation: revisit only when a genuinely separate consumer needs the taxonomy.** Recorded as
an explicit non-goal rather than an oversight.

## Capabilities

### New Capabilities

- `api-versioning`: the `/api/v1` namespace, how it is assembled and mounted, mount ordering against
  the `/api` catch-all, unknown-version handling, naming conventions, the additive-only compatibility
  rules for v1, and the strategy for a future v2.
- `api-client-boundary`: `public/assets/js/api.js` as the single frontend egress; configurable
  `API.BASE_URL` resolution order; the prohibition on ad-hoc `fetch()` from page modules; and the
  requirement that every API URL — including image and download URLs — is constructed inside the
  boundary.
- `api-error-contract`: the stable error envelope for v1, the reserved-but-optional machine-readable
  `kind` token and its format, the no-disclosure rule, and the guarantee that error shape does not
  change within v1.
- `legacy-api-compatibility`: the retained `/api/*` surface as an explicit compatibility alias, the
  conditions and blockers for its eventual removal, and the rollback guarantee.

### Modified Capabilities

- `dashboard-api`: the *Route Registration Precedes Catch-All* and *Filesystem Router Separation*
  requirements name `/api/dashboard` as the single mount point and assert the filesystem router is
  mounted "only at `/api/fs`". Both become untrue once a second prefix serves the same routers, so
  they are restated to cover `/api/v1/dashboard` and the prohibition on filesystem mutations under
  either dashboard prefix.

No other existing capability changes. `filesystem-security` is referenced but **not** modified: its
*No Absolute Path In Any Response* requirement is scoped to Dashboard responses, and the broader
all-endpoint rule is added as a new requirement in `api-error-contract` rather than by widening an
existing security capability owned by an archived change.

## Impact

### Code

| File | Change |
|---|---|
| `src/routes/api.v1.js` | **New.** Assembles the health handler + the three existing routers into one mountable surface. |
| `server.js` | Mount `/api/v1` before the `/api` catch-all; add `/api/health` to the legacy assembly so both prefixes are served by the same handler. |
| `public/assets/js/api.js` | `BASE_URL` resolution (override → default `/api/v1`); add a `thumbnailUrl()` builder; no other behavioural change. |
| `public/assets/js/files.js` | Replace the `window.API.BASE_URL` string concatenation at the thumbnail `<img src>` with the new builder. Call-site paths become `/v1/...`-relative only through `BASE_URL`, not hand-edited. |
| `public/assets/js/app.js`, `dashboard.js`, `notifications.js`, `settings.js`, `uploads.js` | Path prefix follows `BASE_URL`; no per-file version string. |
| `public/*.html` (4 shells) | Add the configuration hook the resolver reads. Sidebar markup is byte-identical and must stay so. |
| `docs/CONTRACTS.md` | Version column / namespace section, error contract, compatibility rules. |
| `docs/REPO_MAP.md`, `AGENTS.md` | New file, new mount point, new rules. |
| `docs/decisions/ADR-007-api-versioning-and-boundary.md` | The decision record. |
| `test/api/*.test.js`, `test/integration/*.test.js`, `test/frontend/*.test.js` | Versioned-path coverage, compat alias coverage, boundary guardrails. |

No service, controller, validator, or middleware behaviour changes. **No new dependency** — the
existing guardrail test asserts the manifest is exactly
`archiver, cors, dotenv, express, helmet, morgan, multer`.

### Verified current coupling (measured, not assumed)

| Claim | Measurement |
|---|---|
| Hardcoded `/api` literals in the frontend | **1** — `api.js:18`. Zero in any page module or HTML shell. |
| API call sites in the frontend | **30**, across 8 modules, all via `window.API.*`. |
| `fetch()` sites in the frontend | **2** — `api.js:49` (API JSON) and `router.js:60` (static page HTML, not the API). |
| URLs built outside the API module | **1** — `files.js:657`, thumbnail `<img src>` via `window.API.BASE_URL` concatenation. |
| Taxonomy copies | **2** (`src/utils/fileTypes.js`, `app.js` `FileTypes`), display-only, set-equality enforced by `test/utils/fileTypes.test.js`. |

The frontend→backend coupling is therefore already narrow. This change does not claim to fix a
structural coupling problem, because there is not a serious one; it fixes a **changeability** problem
and removes the last URL-layout leak.

### Security

Unchanged and explicitly so. This change adds **no** endpoint, adds **no** mutation capability, and
does not alter CORS, authentication, the traversal guard, or error disclosure. `/api/v1` is a URL
alias over the same router instances — the same handlers, the same guards, the same posture. See
`design.md` §7 for the threat model and for what remains unsafe until ADR-003's authentication
prerequisite lands.

### Out of scope

Authentication · CORS changes · origin split · a CDN or bundler · TypeScript · a framework or
Express rewrite · any UI redesign · renaming or reshaping endpoints · adding
`GET /api/v1/fs/file-types` · removing the legacy `/api/*` surface · changing the file-type taxonomy
invariant · any service-layer change.
