# ADR-007 — API Versioning and the Client Boundary

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Project maintainer
- **Tags:** backend, frontend, api, compatibility
- **Change:** `openspec/changes/api-v1-versioning-and-boundary`

## Context

Every endpoint lived at a bare `/api/*` path. A response shape could not evolve without silently
breaking a browser tab that was already open, and `public/assets/js/api.js` hardcoded `'/api'` as a
literal, so "where the API lives" could not change without editing source.

Measured before the change, the frontend coupling was already narrow: there was one `/api` literal
(`api.js`), 30 API call sites across 8 modules, all of them through `window.API`, and two `fetch`
sites (`api.js`, plus `router.js` for static page markup). Exactly **one** URL was built outside the
boundary: `files.js` concatenated `window.API.BASE_URL` for a thumbnail `<img src>`. So this is a
**changeability** problem, not a structural one.

Two server facts shaped the solution. First, the `/api` catch-all in `server.js` is a two-argument
middleware that never calls `next()`, so any mount placed after it is unreachable. Second,
`GET /api/health` was an inline handler, outside any router.

The service is single-operator, same-origin and unauthenticated (ADR-003). That makes now the cheapest
time to introduce versioning: it does not have to land alongside authentication.

## Decision

### 1. The version is a mount prefix; route modules are version-agnostic

`/api/v1/<resource>` is the contract. Route modules (`fs.routes.js`, `dashboard.routes.js`,
`settings.routes.js`) declare **no** version segment. The version is applied only where they are
mounted, so one module can serve any number of prefixes without being copied.

The version is selected **by path only**. No header, query parameter, cookie or content negotiation
selects it.

### 2. One assembly, mounted once at two prefixes

`src/routes/api.js` composes the health handler and the three existing routers. `server.js` mounts it
with a single registration, **before** the `/api` catch-all:

```js
app.use(['/api/v1', '/api'], apiRoutes);
app.use('/api', notFoundCatchAll);
```

Both prefixes run the **same router instances**, so drift is impossible by construction. The health
handler moved into the assembly so `/api/v1/health` is served too. It gained the additive field
`apiVersion: 1`.

The two prefixes share a single array registration, not two `app.use` lines. One `app.use('/api', …)`
in `server.js` therefore stays the catch-all, as the existing guard requires. `/api/v1` is listed
first, so a v1 request is never re-interpreted under the alias.

Express matches mount paths case-insensitively, so the assembly starts with a guard: a version segment
that is not exactly `v1` (for example `/api/V1/...`) leaves the router via `next('router')` and
reaches the catch-all. `/api/v2/...` matches the alias, finds no route, and reaches the catch-all the
same way. Either way the response is the JSON `404` envelope, never v1's handlers and never the SPA
shell.

### 3. The legacy `/api/*` surface is a retained alias; removal is gated on authentication

The alias keeps open tabs, bookmarks and the ~160 test path literals working, and it makes rollback a
configuration edit. Its removal is **not scheduled**, and it requires its own decision record.
Removal is also **blocked on authentication**. Withdrawing the alias would leave the same handlers
reachable under `/api/v1`, so it would reduce the unauthenticated exposure by exactly zero. Treating
alias removal as a security action would misrepresent it as one.

### 4. Within v1, changes are additive only

Allowed within v1: a new endpoint, a new optional response field, or a new optional request parameter
whose absence reproduces current behaviour. A removal, rename or retype goes to a v2 mounted
**alongside** v1. There are no `Deprecation`/`Sunset` headers, because nothing is deprecated, and
machinery with no consumer is the failure mode `AGENTS.md` prohibits.

### 5. `API.BASE_URL` is resolved configuration, defaulting to same-origin `/api/v1`

`api.js` resolves the base **once** at load. The first non-blank source wins:

1. `window.AFM_API_BASE`
2. `<meta name="afm-api-base" content="…">`
3. `/api/v1`

The value is trimmed, and trailing slashes are stripped. The public `API` object is frozen, so one
document never splits its traffic across two bases. The four page shells ship the same-origin
default in a head `<meta>`, which leaves the byte-identical sidebar untouched. A different host or
prefix is now a configuration change. Rolling back to `/api` is one too.

### 6. Every API URL is built inside the boundary

The new `API.thumbnailUrl(path, size)` replaces the `files.js` concatenation. The download and ZIP
builders were already internal. There is deliberately **no** general `API.url(path)`, because it
would re-create the leak with extra steps. Instead, each non-fetch transport gets one named builder.
`router.js`'s `fetch` of static page markup is not an API call and stays out of scope.

### 7. The error envelope is pinned; `kind` is reserved, not emitted

`{ success: false, error }` is stable within v1. The optional `kind` token (`^[a-z][a-z-]*$`) is
reserved. **No endpoint emits it**, and its absence is valid. `api.js` already copies it only when
the server sends a string. Populating `kind` would require auditing every endpoint and touching
`uploads.js`, which another change owns. Emitting it later is additive and needs no client change.

### 8. No `GET /api/v1/fs/file-types` — the taxonomy endpoint is deferred

There are three reasons:

1. **It would not reduce real coupling.** The server already classifies authoritatively: `type` per
   listed item, server-side `counts`, server-side filtering. The client `FileTypes` table is
   display-only.
2. **It would modify a capability owned by an unarchived change.** `type-taxonomy-consistency`
   (from `files-page-correctness`) pins the two-copy agreement as a test-enforced invariant.
3. **It would trade a guaranteed invariant for a network dependency.** If the fetch failed, no file
   would get a badge. That is strictly worse while the frontend and API share one origin and one
   deploy.

Revisit this when a second, independent consumer needs the taxonomy. At that point, adding the
endpoint is a permitted additive v1 change.

### 9. CORS and authentication are untouched

`app.use(cors())` is unchanged. No `Access-Control-Allow-Origin` is introduced or relied on, because
the shipped configuration is same-origin. CORS was **not** widened to decouple anything. Both
authentication and a restricted CORS policy remain ADR-003 prerequisites, for removing the alias and
for any origin split. This change blocks neither.

## Alternatives rejected

- **Header versioning (`Accept-Version`).** It is invisible in access logs and easy to omit. An
  `<img src>`, an iframe download and a form POST cannot set headers at all.
- **Query-parameter versioning.** It pollutes caches and every download URL.
- **Per-version route files** (`routes/v1/*.js`). This is exactly the duplication the change exists
  to avoid.
- **Middleware that rewrites `/api/v2` → `/api/v1`.** It would silently serve a newer client from an
  older contract.
- **Two `app.use` lines in `server.js`.** It works, but it breaks the existing "catch-all registered
  exactly once" guard and scatters the surface across the file whose ordering is most fragile.
- **Global `case sensitive routing`.** It would also change legacy paths such as `/API/fs/list` that
  answer today. The guard restricts case-sensitivity to the version segment.

## Consequences

- `/api/v1/*` and `/api/*` are byte-compatible for every endpoint. This is pinned live by
  `test/api/versioning.contract.test.js`, which also pins that the endpoint set is frozen, that no
  filesystem route exists under either dashboard prefix, that the error envelope discloses nothing,
  and that the mount order and `cors()` line are unchanged.
- The frontend is a v1 consumer, and the boundary is enforced at source by
  `test/frontend/api-boundary.test.js` and `test/integration/repo-guardrails.test.js`.
- One pre-existing assertion was re-pinned: the source pin on the `/api/health` handler now points
  at `src/routes/api.js` and includes `apiVersion`. This was approved by the maintainer.
- Everything ADR-003 records as Critical is unchanged: no authentication, open CORS, and CSP
  disabled. The service must still not be reachable beyond localhost.
