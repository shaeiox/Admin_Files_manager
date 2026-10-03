# AGENTS.md — Dimension Files Manager

> **Identity:** Dimension is a self-hosted **admin file manager**: an Express 5 REST API that exposes a
> sandboxed storage directory (`STORAGE_ROOT`) over HTTP, served alongside a no-build vanilla JS SPA
> (Dashboard / Files / Uploads / Settings). Node's filesystem **is** the database; a JSON file
> (`data/metadata.json`) tracks downloads, stars, and activity.
>
> **Read this first, then `docs/REPO_MAP.md` (navigation) and `docs/CONTRACTS.md` (API/data schemas).**
> Foundational decisions live in `docs/decisions/`.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js (CommonJS) | `"type": "commonjs"` — `require()`, **not** `import` |
| Framework | Express 5.x | Pathless middleware fallback (`app.use`) — Express 4 `app.get('*')` patterns will not work |
| Validation | Custom (`src/utils/validators.js`) | No Zod/Joi — validate via `validateFileName` / `validateClientPath` |
| Uploads | Multer 2.x (`diskStorage`) | Streams to `STORAGE_ROOT` directly; never buffer into memory |
| Archiving | Archiver 8.x | ZIP streams are piped, never collected in memory |
| Persistence | JSON file via `MetadataService` | Atomic temp-file-then-rename writes; singleton instance |
| Frontend | Vanilla JS + CSS (no bundler) | Modules attach to `window` (`window.API`, `window.AFM.*`); `<script>` tag load order matters |
| Logging | Morgan (`dev` format) | Errors also logged via `console.error` in `errorHandler` |
| Dev tooling | Nodemon | Ignores `data/*` and `public/*` |

## Essential Commands

```bash
npm run dev      # Start with nodemon (http://localhost:3000)
npm start        # Start in production mode
npm test         # ⚠ Not configured yet — exits with error. Do not assume tests exist.
```

- No lint/format/build/typecheck tooling is configured. Do not invent commands.
- **Required env:** `STORAGE_ROOT` (absolute path). The server refuses to boot without it
  (`src/config/env.js` calls `process.exit(1)`). Optional: `PORT` (default `3000`).
- Health check: `GET /api/health`.

## Architecture Rules (non-negotiable)

1. **Layered flow:** `routes → controllers → services → fs`.
   - Controllers parse/validate input and format responses.
   - Services own all filesystem access (`FileSystemService`, `MetadataService`, `PathService`).
   - Never register filesystem calls directly in `routes`; never bypass services from controllers.
2. **The path boundary is `PathService`.** Every client-supplied path must pass
   `PathService.resolveSecurePath()` (traversal guard) before touching disk. The API surface speaks
   only in **client paths** (POSIX strings rooted at `/`, e.g. `/media/clip.mp4`); absolute OS paths
   (`securePath`) never leave the services layer and never appear in API responses.
3. **All client paths and names are validated** with `validateClientPath` / `validateFileName`
   (`src/utils/validators.js`) before use. Reuse them; don't hand-roll regex checks.
4. **Async I/O only.** `fs/promises` or streams in services; `createReadStream` for downloads,
   Archiver for ZIPs. Never block the event loop with sync fs calls on the request path.
5. **Error contract:** throw `new AppError(message, statusCode)` from any layer; the global
   `errorHandler` middleware serializes it. Never `res.status(...).json(...)` an error inline from a
   route/controller, never `throw` raw strings or plain `Error` for expected failures.
6. **Response envelope:** success responses are `{ success: true, data: ... }`; errors are
   `{ success: false, error: string }`. Keep new endpoints consistent.
7. **Metadata is eventually consistent, not transactional.** Metadata writes (`incrementDownload`,
   `addActivity`, `deletePath`) are fire-and-forget (`.catch(() => {})`); they must never fail or
   block the filesystem operation they accompany. Don't add `await` chains that make metadata
   failures fatal.
8. **Frontend has no build step.** Plain HTML pages + IIFE modules on `window`. When adding shared
   UI, extend `app.js` (Toast/Modal/Format/Icons); when calling the API, go through `window.API`
   (`public/assets/js/api.js`) — do not call `fetch` ad hoc from page modules.
9. **Downloads never navigate the main frame.** Single files use hidden iframes; ZIP uses a hidden
   form POST targeted at an iframe (see `api.js`). Keep this pattern.

## Hard Constraints & Red Lines

- **No directory traversal, ever.** `resolveSecurePath` must stay the single choke point; any new
  path-consuming code path goes through it. Deletion of the storage root is explicitly blocked.
- **Do not run in read-only environments** without `STORAGE_ROOT` being writable; writes are
  expected to fail at runtime otherwise.
- **Do not commit:** `.env` (contains secrets; currently not ignored in `.gitignore` — see ADR-001
  open questions), `data/*.json` (runtime metadata), `download/`.
- **Filename rules are cross-platform strict:** reject `[<>:"|?*\x00-\x1F]`, reserved Windows names
  (`CON`, `PRN`, `COM1-9`, ...), leading/trailing dots/spaces, and any `/` or `..`. Match
  `validateFileName`; don't loosen it for convenience.
- **Rename is same-directory only** by design (see `FileSystemService.rename`). Cross-directory
  moves need a dedicated, explicitly-designed API — do not silently extend rename.
- **Deletion is permanent** (`fs.rm` recursive, no trash/recycle). UI copy and confirm dialogs must
  reflect that.
- **Browser compatibility target is modern Chrome/Edge-class engines**; no transpilation, no IE support.
- **Some frontend calls are ahead of the backend.** `dashboard.js`, `settings.js`, and parts of
  `app.js` request endpoints that don't exist server-side yet (see "Known gaps" in
  `docs/CONTRACTS.md`). Don't assume a called endpoint is implemented; verify against
  `fs.routes.js` first.

## When You Change Code

- New endpoint: route in `src/routes/fs.routes.js` → handler in `src/controllers/fs.controller.js`
  → logic in a service → document it in `docs/CONTRACTS.md` in the same change.
- New service module: follow the static-class singleton pattern used by `FileSystemService` /
  `PathService` (or instance singleton like `MetadataService`).
- New frontend module: IIFE attached to `window`, loaded after `app.js` and `api.js`, page-gated via
  `<body data-page="...">`.
- Keep `docs/REPO_MAP.md` and `docs/CONTRACTS.md` in sync — stale docs are treated as bugs.
- Stale-tree guard: `docs/STRUCTURE.md` describes the frontend-only era (pre-backend) and lists
  files that no longer exist at those paths; treat `docs/REPO_MAP.md` as the authoritative map.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
