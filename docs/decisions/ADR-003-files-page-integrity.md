# ADR-003 — Files Page Integrity: Truthful Outcomes, One Taxonomy, and a Recorded Security Posture

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Project maintainer (approval points A1–A6 of `openspec/changes/files-page-correctness`)
- **Tags:** files-page, api-contract, data-integrity, accessibility, security

## Context

The Files page is the only page that mutates data. An audit found it reported outcomes the system
had not produced: uploads from a subfolder were written to the storage root while the API answered
with the subfolder path; a partial delete was toasted as complete; a backend outage rendered as an
empty folder with an upload call to action; a ZIP route was commented out while the UI kept calling
it; three hand-maintained extension lists disagreed, so most badged files belonged to no filter
chip; and several controls (share, move, batch rename, star, a topbar search, five sidebar entries)
either did nothing or reported a success they had not achieved. The page was also not operable by
keyboard and inserted filesystem-derived names into `innerHTML` unescaped.

Beneath that sat three substrate findings the page cannot fix by itself: the API has no
authentication, `cors()` admits any origin, and the content security policy is disabled.

ADR-001 recorded several of these as follow-ups (ZIP route, upload overwrite policy, `.env`
exclusion). This record closes those and decides the rest.

## Decision

### 1. Upload placement is decided after the body is parsed

Multipart field wire order is load-bearing: multer resolves the destination when the first file
chunk arrives. Rather than rely on every client ordering fields correctly, bytes are streamed to a
dot-prefixed staging file (`.upload-<random>.part`) and moved to `<destination>/<name>` only once
the whole body is parsed (`src/services/UploadService.js`). A destination sent first is validated
before any byte is written; the reported `data.path` is derived from the resolved destination.
Clients still send `destination` and `overwrite` first, and `docs/CONTRACTS.md` records why.

- **Overwrite policy (closes the ADR-001 follow-up):** refuse with `409` unless `overwrite=true`.
  Refusal is atomic (`link()`, exclusive-copy fallback); replacement is one `rename()`.
- **Size bound:** `UPLOAD_MAX_BYTES`, default 5 GiB, enforced by multer; oversize is `413`.
- Rejected: `multer.memoryStorage` (buffers whole files — violates rule 4); a destination query
  parameter (splits one payload across two channels); a custom storage engine (unnecessary).

### 2. The ZIP route is enabled (closes the ADR-001 follow-up)

`POST /api/fs/download-zip` is uncommented on the existing filesystem router; the filesystem router
is not remounted anywhere else. Enabling it surfaced that Archiver 8 no longer exports a callable
factory, so the controller now constructs `ZipArchive`.

### 3. One taxonomy, reconciled upward

`fs.controller.js` classifies through `src/utils/fileTypes.js` `classifyFile()`; its inline copy is
gone. The server extension set grew to the client's `FileTypes` table (the superset) rather than
the client shrinking to the server's — shrinking would have removed correct badges. Unclassified
files are counted in `other` and get a chip when non-zero. `test/utils/fileTypes.test.js` asserts
the two sets are equal.

**Effect on the Dashboard:** files previously counted as `other` (`.ts`, `.md`, `.bmp`, `.flv`,
`.aac`, `.bz2`, …) now land in their real category, so the storage donut's slices shift. This is a
correction to an already-shipped surface. The storage breakdown keeps its own contract (no `folder`
key); the listing counts keep theirs (`folder` and `other` present). The two are never
cross-asserted.

### 4. Star is a filesystem route

`POST /api/fs/star` on the existing `fs.routes.js`, composing the already-implemented
`MetadataService.toggleStar`, returning the mutating envelope. An optional `starred` boolean makes
the call idempotent (bulk star needs set, not toggle). No new router.

### 5. Remove what cannot work; do not stub it

Share, move, batch rename, the drawer's dead footer buttons, four overflow-menu items, the topbar
search with its shortcut badge, and the notifications bell were removed. The sidebar — duplicated
byte-for-byte on four pages, now asserted identical by a test — loses **Shared** (no sharing
primitive) and **Trash** (deletion is permanent), and **Analytics** (no page exists, `href="#"`).
**Starred**, **Recent** and **Top downloads** become real listing views (`starredOnly=true`,
`sort=modified&dir=desc`, `sort=downloads&dir=desc`). **Server Health** links to the Dashboard's
health panel.

### 6. Select-all is page-scoped and says so

Selection holds only the current page's entries (`state.files` is one page). Selecting the whole
filtered set would need a server-side "all matching ids" contract. The header checkbox is named
"Select all N items on this page", the bulk bar reads "N selected on this page", and a reload
prunes the selection to entries still rendered, so a bulk action can never act on something the
operator cannot see. Cross-page selection is a possible future capability (OQ1).

### 7. Previews are real or explicitly unavailable

`GET /api/fs/thumbnail` produces a bounded (≤512 px) WebP preview **only if an image transformer is
installed**. None is added by this change; as shipped, `GET /api/fs/thumbnail/capability` reports
`available: false` and the page states "Previews are not enabled on this server". Non-images are
refused from the name alone, before any byte is read. Adding a transformer (decoding untrusted
images) is a separate, security-reviewed change. The download endpoint's forced
`application/octet-stream` is deliberately not relaxed to serve previews.

### 8. The list is a grid with a roving tab index

The list and grid views are WAI-ARIA grids with one tab stop per view; arrow keys, Home/End,
Enter (open), Space (select), F2 (rename), Delete and Shift+F10 operate entries. The details drawer
is a modal dialog (`role="dialog"`, `aria-modal`, backdrop, inert background, focus trap, focus
restored to its opener). Escape closes only the topmost layer; its handler runs in the capture
phase so a confirm dialog above the drawer is dismissed alone.

### 9. Security posture — escalated, recorded, not fixed here

These are the highest-severity findings of the audit. Each is recorded at its true severity with a
required follow-up; none is closed by this change.

| Finding | Severity | Current state | Required follow-up |
|---|---|---|---|
| **No authentication** on any endpoint, including upload, rename, delete, star | Critical before any non-localhost exposure | By current design: single operator on a trusted host | An authentication change touching every route, the four page shells and the metadata store's (currently user-less) model. **Required before the service is reachable beyond localhost.** |
| **`cors()` admits any origin** | Critical — same severity as the missing authentication, because together they let any page the operator visits drive every mutating endpoint | Default `cors()` in `server.js` | Restrict origins (or drop CORS entirely for a same-origin SPA) in the same change as authentication. |
| **CSP disabled** (`helmet({ contentSecurityPolicy: false })`) | High | Rendering-time escaping in `files.js` (all filesystem-derived values, tested end to end in `test/integration/escaping.test.js`) is now the only layer for filesystem-derived content | Enable a policy once inline styles/scripts are removed from the remaining pages. Escaping does **not** fully compensate for the missing policy. |
| **`.env` tracked** | High | **Closed here:** `.gitignore` excludes `.env` and the file is untracked. This is the ADR-001 follow-up "Add `.env` to `.gitignore`" — the same item, not a second one. | Rotate any secret that was ever committed. |

> **Status update — `api-security-hardening` (2026-10-05).** The table above is the record as it stood
> when this decision was taken; it is left unedited so the reasoning stays readable. Two of the four
> rows have since moved:
>
> - **`cors()` admits any origin — CLOSED.** CORS is now same-origin by default; the middleware is
>   registered only when `AFM_CORS_ENABLED=true`, from a validated allowlist, and wildcards are
>   refused in production.
> - **CSP disabled — CLOSED, with one recorded gap.** A policy is enabled with `script-src 'self'`
>   (no `'unsafe-inline'`, no `unsafe-eval`) plus `object-src`/`base-uri`/`frame-ancestors`. The shells
>   turned out to contain no inline script and no inline event handler. `style-src` still permits
>   inline styles, because 13 inline `style=` attributes live in the page modules' `innerHTML`
>   templates; rendering-time escaping remains the layer for filesystem-derived strings.
> - **No authentication — STILL OPEN.** This is the one Critical that remains, and it is why the
>   runbook still refuses to call the service safe to expose. CSRF protection is also still absent,
>   because with no session there is nothing to forge yet.
>
> The same change also rate-limited mutating routes, refused uploads below a free-space watermark,
> stopped the read boundary from following symbolic links out of the root, and removed `NODE_ENV`
> from `GET /api/v1/health`.

## Consequences

**Positive**

- Every message the Files page shows describes an outcome the server reported: upload paths come
  from the server, delete counts from `data.deleted`, star state from `data.starred`.
- An outage is an error state with a retry, never an empty folder; no fallback tree is fabricated.
- Every control on the page has a working handler, verified by source-level tests.
- Server and client agree on file types, and a test fails if they drift.

**Negative / accepted trade-offs**

- The Dashboard donut shifts once (decision 3).
- `fs.controller.js` grew a bounded-concurrency listing and a stricter query parser.
- Starred/Recent/Top downloads apply to the folder being browsed, not to the whole tree, because
  the listing reads one directory. The view's subtitle says so.
- The folder tree stops two levels below the root (unchanged); the breadcrumb is the escape hatch
  and the tree says when the current folder is deeper (OQ2).
- `search` matches names, not paths (OQ3, documented).

## References

- `openspec/changes/files-page-correctness/` — proposal, design (D1–D18, R1–R12), specs, tasks.
- ADR-001 follow-ups closed: ZIP routing, upload overwrite policy, `.env` exclusion.
- `docs/CONTRACTS.md` — upload field ordering, partial-delete semantics, ZIP, star, previews,
  taxonomy, security posture.
