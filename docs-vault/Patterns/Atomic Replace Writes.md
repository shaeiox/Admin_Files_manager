---
title: Atomic Replace Writes
type: pattern
language:
  - javascript
  - bash
status: generated
complexity: medium
dependencies:
  - "[[Metadata and Settings Stores]]"
  - "[[Storage Services]]"
  - "[[Deployment Scripts]]"
related-notes:
  - "[[Concurrency and Consistency]]"
  - "[[Singleton Services]]"
  - "[[Code Review]]"
canonical-source: src/services/MetadataService.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - pattern
---

# Atomic Replace Writes

## What it is

State is never half-written in place. New content is written fully under a **temporary or staging name**. A single atomic filesystem operation then makes it visible under the real name:

- `rename(2)` replaces the target.
- `link(2)` publishes without overwriting, failing with `EEXIST` if the name is taken.

Readers see either the old version or the new one, never a torn file. If anything fails before the swap, the staging artifact is discarded.

## Why this codebase uses it

- ADR-001: the metadata store uses *"atomic writes (temp file + rename) and an in-memory cache"*.
- ADR-006: `SettingsService` copies the same `_read` / `_write` with temp-file-then-rename. AGENTS.md tech stack: *"Atomic temp-file-then-rename writes"*.
- AGENTS.md, Hard Constraints (uploads): `UploadService` *"stages bytes in a dot-prefixed `.upload-*.part` file and places the file only after the whole body is parsed... never write directly to the final name."*
- ADR-008 / AGENTS.md (deployment): releases are immutable directories. Activation is a `rename(2)` of the `current` symlink, so `current` and `previous` are never absent.

## Where it appears

- [[Metadata and Settings Stores]]: `_write` in `src/services/MetadataService.js` and `src/services/SettingsService.js` does `writeFile(tmp)` then `rename`. The cache is updated only after the rename.
- [[Storage Services]]: `src/services/UploadService.js` stages under random dot-prefixed names, which are hidden from listings and from the tree walk. It then places the file:
  - `_moveExclusive` (no overwrite) uses `fs.link`. EEXIST means 409. It falls back to `copyFile(..., COPYFILE_EXCL)` where hard links are unsupported.
  - `_moveReplacing` (overwrite) uses `fs.rename`. On EXDEV it copies beside the target, then renames.
- [[Deployment Scripts]]: `scripts/deploy.sh` `atomic_link` runs `ln -sfn` to `link.tmp.$$`, then `mv -Tf` over the real link. An `EXIT` trap deletes a half-built release.

## Code excerpt

> [!example] `src/services/MetadataService.js` `_write`
> ```js
> async _write(data) {
>     const tempPath = `${this.dbPath}.tmp`;
>     const jsonString = JSON.stringify(data, null, 2);
>     await fs.writeFile(tempPath, jsonString, 'utf8');
>     // Rename temp file to actual DB file (Atomic swap)
>     await fs.rename(tempPath, this.dbPath);
>     this.cache = data;
> }
> ```

> [!example] `scripts/deploy.sh` `atomic_link`
> ```bash
> atomic_link() {
>     local link="$1" target="$2" tmp
>     tmp="$link.tmp.$$"
>     ln -sfn "$target" "$tmp"
>     mv -Tf "$tmp" "$link"
> }
> ```

## Pitfalls and known violations

> [!danger] A fixed temp name is not safe under concurrent writers
> `_write` always stages to `${dbPath}.tmp`. Metadata mutators are unlocked read-modify-write and fire-and-forget, so two writes routinely overlap. Both writers truncate the same temp file. If the later JSON is shorter, trailing bytes survive, and the renamed store is invalid JSON, which the next cold read treats as a fatal 500. The second `rename` can also fail with ENOENT, or with EPERM/EBUSY on Windows (Metadata and Settings Stores, "Concurrent writes share one fixed temp-file name", medium). Fix: serialize writes per store through a promise chain and/or use a unique temp name.

- **Rename alone does not make the cache safe.** Metadata mutators change `this.cache` before `_write`, so "update cache only after rename" is moot for them (Metadata and Settings Stores, medium).
- **`_write` failures escape raw.** Path and errno can leak through `toggleStar` and `SettingsService.replace` (low).
- **Not every mutation is staged.** `FileSystemService.copy` writes `fs.cp` straight to the final name. A mid-copy failure leaves a partial tree, and a retry then gets 409 (Storage Services, "A failed recursive copy leaves a partial tree behind", medium). The suggested fix is to copy to a dot-prefixed staging dir, then `rename`.
- **Check-then-act is not atomic.** `rename` / `move` check `exists` and then call `fs.rename`, which on POSIX silently replaces a file that appears in between (Storage Services, low). Uploads avoid this with `link` / EEXIST.
- **Failed releases are not cleaned after rollback.** The `EXIT` cleanup trap is cleared once activation happens, so a rolled-back release keeps a retention slot (Deployment Scripts, low).

## How to apply it in new code

1. Write to a **unique** sibling name in the same directory (same volume), e.g. `${target}.${pid}.${random}.tmp` or a dot-prefixed staging name that listings hide.
2. Publish with `fs.rename` (replace) or `fs.link`, mapping EEXIST to 409 (exclusive). On EXDEV, copy beside the target and then rename.
3. Update any in-memory cache only after the swap succeeds. Mutate a copy, not the cached object.
4. Serialize writers to the same store (a per-store promise queue).
5. On failure, discard the staging artifact (`UploadService.discard` retries EBUSY/EPERM) and throw a static-message `AppError`.
