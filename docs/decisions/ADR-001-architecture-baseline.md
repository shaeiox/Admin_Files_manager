# ADR-001 — Architecture Baseline: Filesystem-as-Database with a Secured Path Boundary

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Project maintainer
- **Tags:** architecture, security, persistence, api

## Context

Dimension Files Manager is a self-hosted admin file manager: it exposes a server-side storage
directory over HTTP and manages it through a browser UI. Early requirements and constraints:

- **The filesystem is the product.** Users browse, upload, rename, download, and delete real files
  in a directory the operator points the server at (`STORAGE_ROOT`). There is no desire to ingest
  or copy those files into another store.
- **Deployment must stay trivial.** The intended operators run this on their own machines/servers.
  A baseline install should be `npm install` + one environment variable — no external database
  server, no build step, no transpilation.
- **Attack surface is intentionally blunt.** The API accepts arbitrary client-supplied paths from
  the browser. Without a guard, a crafted `../../` path reads or deletes anything the Node process
  can reach. Any architecture had to treat path containment as a first-class, centralized concern.
- **Frontend is an internal admin UI**, not a public product: no framework requirement, no SEO, no
  CDN pipeline — but it does want real-time-ish progress, theme support, and a polished desktop feel.
- **Scale is modest.** Directories hold hundreds to low thousands of entries; the metadata set
  (download counts, stars, an activity log) is small and fits comfortably in memory.
- The team works in plain JavaScript (CommonJS) and values code that a single maintainer can read
  end-to-end without tooling.

Options weighed for persistence and structure:

1. **Filesystem + JSON metadata file** (chosen) — zero infrastructure, mirrors the product domain.
2. **SQLite (better-sqlite3)** — robust, but adds a native dependency and a second source of truth
   that can drift from disk reality (files deleted/renamed outside the app).
3. **Full database + file store** (Postgres + object storage) — over-engineered for a single-node
   admin tool; the OS already provides durability, naming, and hierarchy.
4. **Monolithic route file** — fastest to start, but path-validation logic would scatter across
   handlers, which is exactly where traversal bugs breed.

## Decision

1. **Node's filesystem is the database.** `FileSystemService` performs all disk operations;
   supplemental metadata (download counts, starred items, activity log — capped at 50 entries) is
   persisted in a single JSON file (`data/metadata.json`) managed by `MetadataService` with
   **atomic writes** (temp file + rename) and an in-memory cache. Metadata is *advisory*: it is
   written fire-and-forget and never allowed to fail a filesystem operation. Disk state always wins.
2. **A single, mandatory path boundary.** Every client path is a POSIX-style string rooted at `/`.
   `PathService.resolveSecurePath()` is the only place that converts it to an absolute OS path, and
   it rejects anything resolving outside `STORAGE_ROOT` (`403`). Input-name hygiene is separated
   into `validateFileName`/`validateClientPath` (`src/utils/validators.js`). Services receive
   client paths only; absolute `securePath` values never cross back into the HTTP layer.
3. **Layered backend with framework-free services.** `routes → controllers → services → fs`.
   Services are plain static-class modules with no Express imports; controllers own HTTP concerns
   (parsing, Multer, Archiver, response envelopes); a global `errorHandler` middleware is the sole
   serializer for `AppError(message, statusCode)`.
4. **No-build vanilla frontend.** Static HTML pages + IIFE modules attached to `window`, a shared
   core (`app.js`), and a single API client (`api.js`). The server serves `public/` statically with
   an HTML fallback. This trades DX niceties for zero toolchain and instant hackability.
5. **Streaming as the default for I/O-heavy endpoints.** Uploads stream straight to disk via
   Multer `diskStorage`; downloads and ZIP archives are piped (`createReadStream`, Archiver),
   never buffered whole in memory.
6. **CommonJS Express 5 on Node LTS.** `"type": "commonjs"`; Express 5's pathless-middleware style
   is used for the SPA fallback (no wildcard route patterns).

## Consequences

**Positive**

- Zero infrastructure: the app is portable, backup = copy two directories (`STORAGE_ROOT`, `data/`).
- The traversal guard is auditable in one function; hard to introduce a bypass by accident if the
  layering rule ("services only") is respected.
- Metadata failures degrade gracefully (e.g. download counts can lag) without breaking core file
  operations.
- Onboarding cost is near zero for both humans and AI agents: read five small service files and the
  whole system is visible.

**Negative / accepted trade-offs**

- **The JSON metadata store is the weakest link.** The singleton cache is per-process: running
  multiple server instances would lose write consistency (last-writer-wins, cached reads). This is
  accepted for a single-node admin tool. Revisit if clustering is ever needed.
- **No trash/recycle.** Deletes are permanent recursive `fs.rm`; the UI must confirm loudly.
- **Uploads overwrite silently** on name collision — Multer `diskStorage` doesn't dedupe yet;
  a `(1)`-suffix or 409 strategy is a known follow-up.
- **No database ⇒ no queries.** Activity history is capped at 50 entries; star/download analytics
  are bounded by what the JSON file can hold.
- **No build step ⇒ no type checking, tree-shaking, or tests wired in.** `npm test` is a stub; the
  frontend relies on load order and global names instead of module imports, which makes the
  `<script>` sequence part of the contract.
- **Express 5 + vanilla stack means fewer guardrails** (no schema library on the backend), so
  validator coverage must be maintained by hand per endpoint.

**Follow-ups (tracked, not blocking)**

- Uncomment and verify `POST /api/fs/download-zip` routing (`fs.routes.js`).
- Decide upload overwrite policy (reject with `409` vs. auto-suffix) and enforce in Multer config.
- Add `.env` to `.gitignore` (currently only commented entries exist) before any public exposure.
- Introduce a real test runner (Node's built-in `node:test` or Vitest) covering `PathService`
  traversal cases first — they are the security core.

## References

- `src/services/PathService.js` — the security boundary in code
- `src/services/MetadataService.js` — atomic JSON persistence
- `docs/CONTRACTS.md` — the API surface this decision constrains
- `AGENTS.md` — operational rules derived from this ADR

> When a change invalidates any statement above, update this ADR or open a superseding one — do not
> silently diverge.
