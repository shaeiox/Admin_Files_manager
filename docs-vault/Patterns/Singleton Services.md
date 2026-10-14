---
title: Singleton Services
type: pattern
language:
  - javascript
status: generated
complexity: medium
dependencies:
  - "[[Server Bootstrap and Config]]"
  - "[[Storage Services]]"
  - "[[Metadata and Settings Stores]]"
  - "[[Auth and Access Control]]"
  - "[[Frontend Core]]"
related-notes:
  - "[[Concurrency and Consistency]]"
  - "[[System Overview]]"
  - "[[Atomic Replace Writes]]"
  - "[[Re-entrant Page Lifecycle]]"
canonical-source: src/services/MetadataService.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - pattern
---

# Singleton Services

## What it is

Every stateful component in Dimension is **one process-wide object**, created when its module is first `require`d (server) or when its `<script>` tag runs (browser). There is no DI container and no factory. Consumers just `require()` the module or read `window.X`. State lives on the instance, in static fields, or in a module closure.

The codebase uses four variants:

| Variant | Shape | Where |
|---|---|---|
| Config object | Plain object built at require time | `src/config/env.js` (`module.exports = config`) |
| Static-method class | `class X { static ... }`, exported as the class itself | `FileSystemService`, `PathService`, `UploadService`, `PreviewService` |
| Instance singleton | `module.exports = new X()` | `MetadataService`, `SettingsService`, `SessionService`, `UserService`, `FileAccessPolicyService`, `AdminDatabase` (`src/db/connection.js`) |
| Browser IIFE on `window` | `const X = (() => { ...; return {...}; })(); window.X = X;` | `window.API` (frozen), `window.AFM.*`, page modules |

## Why this codebase uses it

- AGENTS.md, "When You Change Code": *"New service module: follow the static-class singleton pattern used by `FileSystemService` / `PathService` (or instance singleton like `MetadataService`)."*
- AGENTS.md tech stack lists "singleton instances" for the JSON stores. ADR-006 says outright that `SettingsService` is "an instance singleton modelled directly on `MetadataService`".
- AGENTS.md rule 8 requires frontend modules to be IIFEs attached to `window`, because there is no bundler.
- The real payoff is **test seams**. Each stateful singleton exposes a mutable hook, so a suite can redirect state *before* `server.js` loads:
  - `MetadataService.dbPath` and `SettingsService.dbPath`, plus the settings cache.
  - `AdminDatabase.dbPath` and `reset()`.
  - `PreviewService._useTransformer`.
  - `UploadService._useFreeSpaceReader`.
  - The injectable `source` parameter of `validateStartup`.

  AGENTS.md: *"Tests never touch the real stores... every suite that boots the server points `MetadataService.dbPath` ... at a temp file before requiring `server.js`."*
- ADR-001 records the cost: *"The singleton cache is per-process"*. Running more than one process against the same store is unsupported.

## Where it appears

- [[Server Bootstrap and Config]]: `src/config/env.js` builds `config` once. `validateStartup(source)` stays pure and injectable, so requiring config never exits.
- [[Storage Services]]: `src/services/FileSystemService.js`, `PathService.js`, `UploadService.js`, `PreviewService.js` are static classes. Their mutable state lives in closures (`inFlightUploads`, `transformer`).
- [[Metadata and Settings Stores]]: `src/services/MetadataService.js` and `src/services/SettingsService.js` are instance singletons. Each holds `this.cache` and `this.dbPath`.
- [[Auth and Access Control]]: services, repositories and `AdminDatabase` all export `new X()`. `AdminDatabase` exposes `dbPath` and `reset()`.
- [[Frontend Core]]: `public/assets/js/api.js` (`Object.freeze`d `API`, so `BASE_URL` cannot be repointed), `app.js` (`window.AFM`), `router.js`, `sidebar.js`, `theme.js`.

## Code excerpt

> [!example] `src/db/connection.js`: an instance singleton with a test reset seam
> ```js
> class AdminDatabase {
>     constructor() {
>         this.dbPath = path.join(resolveDataDir(), 'admin.sqlite');
>     }
>     // ...
>     reset() {
>         if (this._db) {
>             this._db.close();
>             this._db = null;
>         }
>     }
> }
> module.exports = new AdminDatabase();
> ```

## Pitfalls and known violations

> [!warning] A singleton cache assumes it is the only writer
> `MetadataService.cache` is filled on first read and never invalidated. Mutators edit the cached object **in place** before `_write` runs. If the write fails, memory and disk disagree, and `toggleStar` can return a 500 for a flip that did happen (Metadata and Settings Stores, "Cache is mutated in place before the write succeeds", medium). A second process, or an operator editing `data/metadata.json` by hand, is invisible to the cache.

> [!warning] Singletons that bypass the config singleton
> `UploadService` parses `UPLOAD_MAX_BYTES` again and reads `AFM_UPLOAD_MAX_CONCURRENT` from `process.env` on every request, instead of going through the validated `config`. Two parsers can drift (Storage Services, "Upload limits bypass the validated config", low).

- **Module-load env reads are frozen.** `rateLimit.js` reads its env overrides at module load. A test or runtime change made after the first `require` is ignored.
- **Test seams are ordering-sensitive.** Repointing `dbPath` *after* `server.js` has loaded and a read has filled the cache has no effect on the cached data. `SettingsService` additionally needs its in-memory cache cleared (AGENTS.md).
- **Duplicated skeleton.** `MetadataService` and `SettingsService` repeat the same `_read`/`_init`/`_write` body (Metadata and Settings Stores, "Duplicated store skeleton", low).

## How to apply it in new code

1. Stateless filesystem logic: write a `class X` with only `static` methods and `module.exports = X`. Keep any mutable state in a module-level `let`, and mark per-process limits with a `ponytail:` comment, as `UploadService` does.
2. Stateful stores: write `module.exports = new X()` and keep the path on `this.dbPath`, resolved via `resolveDataDir()`, so tests can redirect it. Add `reset()` if the object holds an open handle.
3. Read configuration from the `config` singleton, not from `process.env`.
4. Browser modules: use an IIFE assigned to `window.X`, loaded after `app.js` and `api.js`. Freeze it if a caller must not mutate it.
5. Document the new seam in the suite that uses it. Do not add a DI container for a single implementation.
