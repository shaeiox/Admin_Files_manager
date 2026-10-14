---
title: Code Review
type: health
language:
  - javascript
  - bash
status: generated
complexity: high
dependencies:
  - "[[Server Bootstrap and Config]]"
  - "[[HTTP API Layer]]"
  - "[[Storage Services]]"
  - "[[Metadata and Settings Stores]]"
  - "[[Auth and Access Control]]"
  - "[[Frontend Core]]"
  - "[[Files Page]]"
  - "[[Feature Pages]]"
  - "[[Deployment Scripts]]"
related-notes:
  - "[[Health Summary]]"
  - "[[Limitations]]"
  - "[[Path Containment and Client Paths]]"
  - "[[Error Contract and Sanitization]]"
  - "[[Concurrency and Consistency]]"
  - "[[Authentication and CSRF]]"
  - "[[Truthful Reporting and Unavailability]]"
canonical-source: server.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - health
---

# Code Review

This page lists 71 bug risks and improvement opportunities: 1 high, 20 medium and 50 low. Entries are ordered by severity, and within each severity bugs come before improvements. Design constraints are in [[Limitations]], and the counts are in [[Health Summary]].

## System-wide themes

The individual findings group into a handful of recurring themes:

1. **Path containment is lexical where it needs to be canonical (high).** The four mutating filesystem operations check the path string, not the resolved path, so an in-root symlink lets a write escape `STORAGE_ROOT`. The same string-check habit shows up in three other places:
   - the containment check in the deploy script;
   - the login redirect guard;
   - the startup check, which tests readability but not writability.

   See [[Path Containment and Client Paths]].
2. **Path-keyed state drifts when a folder is renamed or deleted (medium).** Metadata keys and access-policy rows match exact paths only. For access policies this matters: a policy can silently stop applying, or attach to a later file that reuses the name.
3. **Unlocked read-modify-write and check-then-act races (medium, 6 modules).** These show up in two places:
   - the shared `.tmp` path for store writes;
   - mutating the cache before the write succeeds, star toggling, ZIP error paths, signal handling, upload queues, router navigation and deploy locks.

   The system relies on event-loop serialization and gives each process one shared service instance, but has no explicit locks or write queues. See [[Concurrency and Consistency]].
4. **Expected failures escape as raw 500s or unsanitized messages (medium).** The holes in the `AppError` contract are:
   - bulk handlers can leak absolute paths;
   - malformed input turns into a 500 instead of a 400 or 401 (cookies, NUL bytes, names that are too many bytes long, a missing ZIP body);
   - foreign-key errors on user delete.

   See [[Error Contract and Sanitization]].
5. **Silent failure and false success (medium).** These cases contradict the project's own truthfulness rule:
   - a metadata outage shown as empty data;
   - a clipboard copy that reports success when it failed;
   - dropped folders whose files are silently skipped;
   - a manual rollback that exits 0 on an unhealthy release.

   See [[Truthful Reporting and Unavailability]].
6. **Admin identity edge cases (medium).** The new phase-1 auth code (ADR-009) has not yet had the hardening the filesystem boundary has had:
   - no last-admin guard;
   - a lockout that re-arms indefinitely;
   - a login timing leak;
   - untyped policy flags;
   - a CSRF comparison that is not constant-time.

   See [[Authentication and CSRF]].
7. **UI promise and lifecycle leaks (medium/low).** These follow from the re-entrant page lifecycle (ADR-005):
   - modal promises are left pending when a modal is force-closed;
   - a poll starts after the page's `destroy()` has run;
   - a tray is never re-rendered after `init()`.
8. **Doc and config drift (low).** AGENTS.md treats these as bugs:
   - stale comments;
   - config re-parsed outside the validated config object;
   - duplicated code skeletons.
9. **Unbounded growth and per-request cost (low).** These are fine at single-operator scale but have no ceiling:
   - a full-store rewrite on every download;
   - a synchronous SQLite write per request;
   - a recursive walk per folder before paging;
   - failed releases using up retention slots.

## High severity

### Mutating operations use only the lexical path guard

**Module:** [[Storage Services]]
**Type:** bug-risk
**Severity:** high
**File:** `src/services/FileSystemService.js:92-301`

Reads, downloads, previews and upload destinations go through `PathService.resolveSecureRealPath`. It canonicalises the path and refuses a symlink or junction escape. `createDirectory`, `rename`, `move` and `copy` call only `resolveSecurePath`, which checks the path *string*. `remove` is safe only by accident, because it calls `getStats` (which uses realpath) first.

> [!danger] Why This Matters
> AGENTS.md notes that the operator-populated root may contain links created out of band. If the root contains `/link -> /etc`:
> - `copy('/link/passwd', '/')` copies an outside file into the root, where it can then be downloaded;
> - `move('/docs/a.txt', '/link')` moves an in-root item outside the root;
> - `createDirectory('/link/x')` creates a directory outside the root.
>
> This breaks the project's first red line: no directory traversal, ever.

> [!example] Current Code
> ```js
> const oldSecurePath = PathService.resolveSecurePath(oldClientPath);
> const destSecurePath = PathService.resolveSecurePath(destinationClientPath);
> ```

> [!tip] Suggested Improvement
> ```js
> const oldSecurePath = await PathService.resolveSecureRealPath(oldClientPath);   // 404/403 handled there
> const destSecurePath = await PathService.resolveSecureRealPath(destinationClientPath);
> // for createDirectory / rename targets: realpath the parent, then join the validated name
> ```
> This canonicalises every operand that already exists, and the parent of every target that is about to be created. Canonicalising the source changes what the self/descendant check compares against, so both sides must come from `resolveSecureRealPath`.

## Medium severity

### CORS allowlist validated normalized but matched raw

**Module:** [[Server Bootstrap and Config]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/config/env.js:141-182`

At startup, `validateCorsOrigin` accepts values with a trailing slash or a mixed-case host. Its duplicate check also compares normalized origins. At request time, though, `server.js` (lines 69-81) compares the browser's `Origin` header against the raw configured strings with `allowedOrigins.includes(requestOrigin)`.

> [!danger] Why This Matters
> A browser always sends the normalized form (`https://app.example.com`). So an entry such as `https://app.example.com/` passes validation but never matches, and that origin is refused without any warning. The failure is closed, so it is safe, but it is silent.

> [!example] Current Code
> ```js
> return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
> ```

> [!tip] Suggested Improvement
> ```js
> .map((s) => { try { return s === '*' ? s : new URL(s).origin; } catch { return s; } })
> ```
> This stores what the browser will actually send. Alternatively, have `validateCorsOrigin` reject any value where `new URL(value).origin !== value`.

### Bulk handlers leak unsanitized error messages

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/controllers/fs.controller.js:348-475`

In `move`, `copy` and `delete`, each per-item `catch` stores `err.message` verbatim in `data.failed[]`, whatever the error class. If every item fails, the handler wraps the first raw message in a new `AppError`, which `errorHandler` then trusts.

> [!danger] Why This Matters
> Raw fs errors embed absolute paths, for example `ENOENT: ... rename 'D:\storage\...'`. `errorHandler` normally replaces non-`AppError` messages with a generic string to prevent exactly this. The bulk path skips that protection twice: in a 200 body on partial failure, and in the error response on total failure. That breaks rule 2, which says OS paths never leave the services layer.

> [!example] Current Code
> ```js
> results.failed.push({ path: clientPath, error: err.message, statusCode: err.statusCode || 500 });
> ```

> [!tip] Suggested Improvement
> ```js
> const safe = err instanceof AppError ? err.message : 'Operation failed.';
> results.failed.push({ path: clientPath, error: safe, statusCode: err.statusCode || 500 });
> ```
> This sanitizes at the point where the error is collected, so neither the partial-failure body nor the rethrow can carry a raw message.

### Dashboard metadata failure is silent and looks like "empty"

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/controllers/dashboard.controller.js:127-140`

An empty `catch {}` drops the metadata error without logging it, and degrades `activities` and `topFiles` to `[]`. AGENTS.md still says that a corrupt metadata store makes the summary a 500, so the code and the project rules disagree.

> [!danger] Why This Matters
> A client cannot tell "no activity yet" from "store unreadable". AGENTS.md requires a quantity that could not be measured to be marked explicitly unavailable, never shown as an empty reading.

> [!tip] Suggested Improvement
> ```js
> } catch (err) {
>     console.error('[Dashboard] metadata unavailable:', err.message);
>     metadataAvailable = false;
> }
> // ... res.json({ ..., activities, topFiles, metadataAvailable })
> ```
> The new flag is an additive field, which v1 allows. Update AGENTS.md and CONTRACTS.md in the same change.

### toClientPath compares a canonical path to the lexical root

**Module:** [[Storage Services]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/PathService.js:101-118`

`resolveSecureRealPath` returns a path proven to be inside `realpath(root)`. `toClientPath`, however, checks containment against `path.resolve(root)`. `UploadService` (lines 116-157) consumes the result.

> [!danger] Why This Matters
> Suppose `STORAGE_ROOT` is itself a symlink or junction, or realpath spells it differently from the configured string. Then every canonical path fails the prefix test and collapses to `/`. `resolveDirectory('/media')` returns `clientPath: '/'`, and the upload lands in the storage root instead of `/media`. That is exactly the misfiling the staging scheme exists to prevent.

> [!tip] Suggested Improvement
> ```js
> for (const root of [path.resolve(config.storageRoot), realRootCached]) {
>     if (absolutePath === root || absolutePath.startsWith(root + path.sep)) {
>         const rel = absolutePath.substring(root.length).replace(/\\/g, '/');
>         return rel.startsWith('/') ? rel : `/${rel}`;
>     }
> }
> return '/';
> ```
> Accept either basis for the root. Alternatively, have `resolveDirectory` return the client path it already validated instead of deriving it again.

### A failed recursive copy leaves a partial tree behind

**Module:** [[Storage Services]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/FileSystemService.js:289-300`

`fs.cp` can fail part-way: ENOSPC, EACCES on one nested file, or a file removed mid-copy. When it does, the part that was already copied stays at `newSecurePath`. Nothing in the `catch` cleans it up.

> [!danger] Why This Matters
> The user sees a failure, but a half-populated copy now exists. A retry is then refused with 409, because the name is taken.

> [!tip] Suggested Improvement
> ```js
> const staging = path.join(destSecurePath, `.copy-${crypto.randomBytes(8).toString('hex')}`);
> try {
>     await fs.cp(oldSecurePath, staging, { recursive: true, force: false, errorOnExist: true });
>     await fs.rename(staging, newSecurePath);
> } catch (error) {
>     await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
>     throw mapCopyError(error);
> }
> ```
> This copies to a dot-prefixed staging name, which listings hide just as they hide upload staging files, and then renames it into place. On failure it removes the staging tree.

### Concurrent store writes share one fixed temp file

**Module:** [[Metadata and Settings Stores]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/MetadataService.js:115-127`

`_write` always stages to `${dbPath}.tmp`. `SettingsService` has the same code at lines 105-117. Mutators do an unlocked read-modify-write, and metadata writes are fire-and-forget, so writes routinely overlap.

> [!danger] Why This Matters
> Overlapping writers both truncate and write the same temp file. If the later JSON is shorter, trailing bytes from the longer one survive, and the renamed store is invalid JSON. The module deliberately treats that as a fatal 500 on the next cold read. The second `rename` can also fail with `ENOENT`, or with `EPERM`/`EBUSY` on Windows.

> [!example] Current Code
> ```js
> async _write(data) { const tempPath = `${this.dbPath}.tmp`; ... }
> ```

> [!tip] Suggested Improvement
> ```js
> _write(data) {
>     this._queue = (this._queue || Promise.resolve()).catch(() => {}).then(async () => {
>         const tempPath = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`;
>         await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
>         await fs.rename(tempPath, this.dbPath);
>         this.cache = data;
>     });
>     return this._queue;
> }
> ```
> A promise-chain queue serializes the writes, and a unique temp name removes the shared file.

### Metadata cache is mutated before the write succeeds

**Module:** [[Metadata and Settings Stores]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/MetadataService.js:145-313`

Every metadata mutator edits `this.cache` directly and then calls `_write`. The "update cache only after rename" step in `_write` therefore does nothing for metadata.

> [!danger] Why This Matters
> If a write fails, memory already reflects the change but disk does not, and the next successful write silently persists it. `toggleStar` reports a 500 even though the star has already flipped in memory, so a retry flips it back.

> [!tip] Suggested Improvement
> Mutate a copy (`structuredClone(db)`) and let `_write` install it. Alternatively, reset `this.cache = null` in a catch so the next read reloads from disk.

### Deleting an admin who has audit rows fails with a 500

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/db/schema.js:50-96`

Several columns reference `users(id)` with no `ON DELETE` action: `audit_logs.actor_id`, the policy `created_by` and `updated_by` columns, and `granted_by`. Foreign keys are enforced. Every admin mutation writes an audit row with `actor_id = req.user.id`.

> [!danger] Why This Matters
> `DELETE /admin/users/:id` on any admin who has ever performed an admin action raises a raw SQLite FOREIGN KEY error. That surfaces as a generic 500, not a meaningful 409.

> [!example] Current Code
> ```sql
> actor_id INTEGER REFERENCES users(id),
> ```

> [!tip] Suggested Improvement
> ```sql
> actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
> ```
> Do this in a migration v3 table rebuild, so audit rows outlive their actor. Alternatively, soft-delete users and allow only `status = 'disabled'`.

### No guard against removing the last active admin

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/UserService.js:41-60`

An admin can disable or delete their own account, or the only other admin. `setStatus` then revokes all of that admin's sessions.

> [!danger] Why This Matters
> `ensureBootstrapAdmin` runs only when the `users` table is empty. If non-admin users remain, the admin panel becomes unreachable and there is no way to recover from inside the app.

> [!tip] Suggested Improvement
> In `UserService.setStatus` and `delete`, refuse with 409 when the target is an active admin and the count of active admins is 1. Also consider refusing `id === req.user.id`.

### Account lockout re-arms on every failure after it expires

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/SessionService.js:27-36`

`failed_login_count` is reset only on a successful login. Once the 15-minute lock lapses, the count is still at least 10.

> [!danger] Why This Matters
> After the lock expires, a single wrong password locks the account for another 15 minutes. The lockout is keyed on username alone. So anyone who knows an admin's username can keep that account locked forever with one request every 15 minutes, and the per-IP limiter does not help.

> [!example] Current Code
> ```js
> if (user.locked_until && user.locked_until > Date.now()) return { ok: false };
> ```

> [!tip] Suggested Improvement
> ```js
> if (user.locked_until) {
>     if (user.locked_until > Date.now()) return { ok: false };
>     UserRepository.resetLoginFailures(user.id);
>     user.failed_login_count = 0;
> }
> ```
> This resets the counter when an expired lock is observed. Also consider IP+account throttling in place of a hard account lock.

### Login reveals whether an account exists

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/services/SessionService.js:24-29`

A username that does not exist, is disabled or is locked returns immediately. An active username pays for a `scryptSync` first. Separately, if the username exists and the password is missing or not a string, `scryptSync` throws, which produces a 500.

> [!danger] Why This Matters
> Response time tells existing accounts apart from missing ones. The status code does too: 500 for an existing user versus 401 for an unknown one. Both contradict the "identical 401 for every failure" contract.

> [!tip] Suggested Improvement
> ```js
> if (typeof username !== 'string' || typeof password !== 'string') return { ok: false };
> const user = UserRepository.findByUsername(username.trim());
> const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
> if (!user || user.status !== 'active' || !ok) { /* existing failure handling */ }
> ```
> This rejects non-string credentials up front with the same 401, and always pays the scrypt cost by verifying against a fixed dummy hash when the user is missing.

### Access-policy rename/delete hooks match the exact path only

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** medium
**File:** `src/db/repositories/FileAccessPolicyRepository.js:86-94`

`renamePath` and `deletePath` match `client_path = ?` exactly. If a rename targets a path that already has a `files` row, it hits the UNIQUE constraint, and that error is swallowed.

> [!danger] Why This Matters
> Renaming or deleting `/a` leaves the policies for `/a/b.txt` under the old path. A deleted path's rows can later attach to a different file created at the same path. This matters once enforcement lands.

> [!tip] Suggested Improvement
> Also update descendants: match `WHERE client_path = ? OR client_path LIKE ? || '/%'` and rewrite the prefix with `? || substr(client_path, length(?) + 1)`. On rename, delete the destination row first.

### Modal.closeAll strands confirm and prompt promises

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** medium
**File:** `public/assets/js/app.js:446-573`

`confirm()` and `prompt()` resolve only through their own `finish()`. The global Escape shortcut and `router.js#teardown` both call `Modal.closeAll()`, which only removes the `is-open` class.

> [!danger] Why This Matters
> The promise never settles, so any caller awaiting it hangs forever. That includes a page's `beforeLeave()` confirm and every delete confirm. Hidden backdrops also pile up in `<body>`.

> [!example] Current Code
> ```js
> function closeAll() {
>   $$('.modal-backdrop.is-open').forEach(b => b.classList.remove('is-open'));
>   ...
> }
> ```

> [!tip] Suggested Improvement
> ```js
> const pending = new Set();             // cancel callbacks of open confirm/prompt dialogs
> function closeAll() {
>   pending.forEach(cancel => cancel()); // resolves false / null and removes the node
>   $$('.modal-backdrop.is-open').forEach(b => b.classList.remove('is-open'));
>   ...
> }
> // in confirm(): const cancel = () => finish(false); pending.add(cancel); finish() deletes it
> ```
> Keep a registry of open dialogs so a forced close settles each one.

### "System" theme cannot stay selected

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** medium
**File:** `public/assets/js/theme.js:104-238`

Choosing System removes the stored key and then calls `apply(systemTheme)`. However, `apply()` writes the concrete `'light'` or `'dark'` back to `localStorage` whenever the theme changes, and `onSystemChange` does the same. `refresh()` and `apply()` also mark the Light or Dark card active instead of System.

> [!danger] Why This Matters
> System mode survives only if the OS theme already matches the current one, and the first OS theme change loses it.

> [!example] Current Code
> ```js
> try { localStorage.setItem(STORE_KEY, JSON.stringify(theme)); } catch (e) {}
> ```

> [!tip] Suggested Improvement
> ```js
> // apply(theme, animate, persist = true)
> if (persist) try { localStorage.setItem(STORE_KEY, JSON.stringify(theme)); } catch (e) {}
> // onSystemChange and the 'system' card call apply(t, true, false);
> // updatePickerCards marks 'system' active when no key is stored
> ```
> Keep the stored preference separate from the applied theme, and persist only on an explicit user choice.

### A dropped folder that exists off the current page is skipped

**Module:** [[Files Page]]
**Type:** bug-risk
**Severity:** medium
**File:** `public/assets/js/files.js:2108-2134`

The "already exists, merge into it" test looks only at `state.files`. That is a single page of a listing that is paginated, sorted, searched and type-filtered.

> [!danger] Why This Matters
> A dropped folder whose name exists but is not on the visible page is treated as new. `POST /fs/folder` then fails, the `catch` returns, and every file inside that folder is silently left out of the upload.

> [!example] Current Code
> ```js
> const exists = isTop && state.files.some(f => f.isFolder && f.name === entry.name);
> if (!exists) { try { await API.post('/fs/folder', { path: folderPath }); createdFolders++; } catch { return; } }
> ```

> [!tip] Suggested Improvement
> ```js
> try {
>   await window.API.post('/fs/folder', { path: folderPath }, { silent: true });
>   createdFolders++;
> } catch (e) {
>   if (e && e.status !== 409) { Toast.error('Folder not created', e.message); return; }
>   // 409: it already exists - merge into it (uploads never overwrite)
> }
> ```
> Attempt the create and treat a 409 as "merge", instead of inferring existence from the rendered page.

### Login open-redirect guard can be bypassed

**Module:** [[Feature Pages]]
**Type:** bug-risk
**Severity:** medium
**File:** `public/assets/js/login.js:18-24`

`safeRedirectTarget()` rejects only three kinds of value: values that do not start with `/`, values that start with `//`, and values that contain `://`. For http(s) URLs, browsers treat a backslash as a slash and strip tab and newline characters.

> [!danger] Why This Matters
> `?redirect=/\evil.example` and `?redirect=/%09/evil.example` both pass every check and resolve to `https://evil.example/`. A crafted login link can therefore send a freshly authenticated admin off-site.

> [!example] Current Code
> ```js
> if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return 'index.html';
> return raw;
> ```

> [!tip] Suggested Improvement
> ```js
> let url;
> try { url = new URL(raw, window.location.origin); } catch { return 'index.html'; }
> if (!raw.startsWith('/') || url.origin !== window.location.origin) return 'index.html';
> return url.pathname + url.search + url.hash;
> ```
> Resolving the value with the browser's own URL parser and requiring the same origin closes every parser-differential bypass at once.

### Dashboard health poll can start after destroy()

**Module:** [[Feature Pages]]
**Type:** bug-risk
**Severity:** medium
**File:** `public/assets/js/dashboard.js:1073-1093`

`init()` returns `loadSummary().then(ok => { if (ok) startHealthPolling(); })`. If the router navigates away first, `destroy()` runs while no timer exists yet. The late `.then` then starts a 5 s interval.

> [!danger] Why This Matters
> `renderHealth()` returns early when `#serverHealth` is absent, so the poll's self-terminating guard never trips. As a result, `GET /dashboard/health` keeps firing every 5 s on other pages until a full reload.

> [!tip] Suggested Improvement
> ```js
> let alive = false;
> function init() { alive = true; ...; return loadSummary().then(ok => { if (ok && alive) startHealthPolling(); }); }
> function destroy() { alive = false; stopHealthPolling(); ... }
> ```
> Put the same guard inside `startHealthPolling()` itself, so the refresh and quick-action paths are covered too.

### Ship mode rm -rf's a caller-supplied OUT_DIR

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** medium
**File:** `scripts/trigger-deploy.sh:46-79`

`OUT_DIR` is documented as the output location for `--package-only`, but ship mode honours it too. Line 79 then deletes the directory unconditionally.

> [!danger] Why This Matters
> If `OUT_DIR=.` or `OUT_DIR=~/builds` is exported in the shell, a normal deploy recursively deletes that directory and everything in it.

> [!example] Current Code
> ```bash
> out_dir="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/dimension-pkg.XXXXXX")}"
> ...
> rm -rf -- "$out_dir"
> ```

> [!tip] Suggested Improvement
> ```bash
> if [[ -n "${OUT_DIR:-}" ]]; then out_dir="$OUT_DIR"; own_dir=0
> else out_dir="$(mktemp -d "${TMPDIR:-/tmp}/dimension-pkg.XXXXXX")"; own_dir=1; fi
> ...
> if (( own_dir )); then rm -rf -- "$out_dir"; else rm -f -- "$artifact"; fi
> ```
> The script removes only a directory it created itself. In a directory the caller supplied, it removes just the artifact.

### Failed manual rollback leaves the service on an unhealthy release

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** medium
**File:** `scripts/deploy.sh:166-182`

`cmd_rollback` has three problems:
- It swaps the `current` and `previous` links and restarts. If the target is unhealthy, it reports `rollback-failed` but stays on that target.
- It never sets `ACTIVATED=1`, so an unexpected error is misreported as `pre-activation-failed`.
- A successful rollback exits 0, but the script header documents `rolled-back` as exit 3.

> [!danger] Why This Matters
> A healthy release can be replaced by an unhealthy one with no automatic restore. The recorded outcome then misstates what happened.

> [!tip] Suggested Improvement
> ```bash
> atomic_link "$CURRENT" "$previous"; ACTIVATED=1
> [[ -n "$active" ]] && atomic_link "$PREVIOUS" "$active"
> if restart_service && health_ok; then finish "rolled-back" 0; fi
> if [[ -n "$active" ]]; then
>     atomic_link "$CURRENT" "$active"; atomic_link "$PREVIOUS" "$previous"
>     restart_service && health_ok && { fail "target unhealthy; original release restored"; finish "rollback-failed" 4; }
> fi
> ```
> If the health check fails, re-point `current` to the original release and restart before reporting. Also document exit 0 with outcome `rolled-back` as the success code for a manual rollback.

### Modal and ContextMenu insert caller strings as raw HTML

**Module:** [[Frontend Core]]
**Type:** improvement
**Severity:** medium
**File:** `public/assets/js/app.js:485-655`

`Modal.confirm` and `Modal.prompt` interpolate `title`, `message`, `label`, `hint`, `value`, `placeholder` and button text as raw HTML. `ContextMenu.show` does the same with `label` and `shortcut`. `Toast` already escapes, so the toolkit is inconsistent.

> [!danger] Why This Matters
> CSP is disabled. That means safety depends on every caller remembering to `escapeHtml` filesystem-derived names. The `value="${value}"` attribute breaks with a single `"` in a filename.

> [!example] Current Code
> ```js
> <input class="input" type="text" value="${value}" ...>
> ```

> [!tip] Suggested Improvement
> ```js
> const input = backdrop.querySelector('input'); input.value = value;
> ```
> Escape by default, with an explicit opt-in such as `messageHtml` for trusted markup, or set fields through `textContent` and `input.value`. This removes the failure mode instead of policing every caller.

## Low severity

### PORT is never validated

**Module:** [[Server Bootstrap and Config]]
**Type:** bug-risk
**Severity:** low
**File:** `src/config/env.js:41`

`port: process.env.PORT || 3000` passes the raw string to `app.listen`. Every other numeric variable is checked by `validateStartup`, but this one is not.

> [!danger] Why This Matters
> Node treats a non-numeric value such as `PORT=abc` as a pipe path, so the server "boots" without listening on any TCP port. An out-of-range value throws a `RangeError` stack instead of the `FATAL CONFIGURATION ERROR` line.

> [!tip] Suggested Improvement
> In `validateStartup`, if `source.PORT` is set, require that it matches `/^\d+$/` and that `1 <= n <= 65535`.

### A second shutdown signal reports a clean exit mid-transfer

**Module:** [[Server Bootstrap and Config]]
**Type:** bug-risk
**Severity:** low
**File:** `server.js:168-184`

`process.once` is registered separately for each signal, so `SIGTERM` followed by `SIGINT` runs `shutdown()` twice. The second `server.close(cb)` receives `ERR_SERVER_NOT_RUNNING`, which the callback ignores.

> [!danger] Why This Matters
> The callback logs "All connections closed" and calls `process.exit(0)` while uploads and downloads are still in flight. The process reports a clean exit after cutting off transfers.

> [!tip] Suggested Improvement
> Guard with a module-level `shuttingDown` flag, and treat a repeat signal as an explicit forced exit with status 1. Also check the `err` argument in the close callback.

### Idempotent star set races (read-then-toggle)

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** low
**File:** `src/controllers/fs.controller.js:596-599`

`setStar` reads `starred` and then calls `toggleStar` when the requested value differs.

> [!danger] Why This Matters
> Two concurrent `{ starred: true }` requests can both read `false` and both toggle, so the file ends up unstarred.

> [!tip] Suggested Improvement
> Add `MetadataService.setStar(path, value)`, which writes the absolute value inside the store's own write. Keep toggle only for requests that send no `starred` value.

### ZIP entries collide on duplicate basenames

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** low
**File:** `src/controllers/fs.controller.js:636-685`

Each ZIP entry is named with `path.posix.basename(clientPath)`.

> [!danger] Why This Matters
> Selecting `/a/report.pdf` and `/b/report.pdf`, for example from a cross-folder starred or search view, writes two entries with the same name. Sending the same path twice does the same. Extractors then overwrite one file or prompt.

> [!tip] Suggested Improvement
> De-duplicate `rawPaths`, and add a suffix to colliding names (`report (2).pdf`) before calling `archive.file` or `archive.directory`.

### downloadZip dereferences req.body without a guard

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** low
**File:** `src/controllers/fs.controller.js:617`

In Express 5, `req.body` is `undefined` when no body parser matched the request. Every other handler uses `req.body || {}`.

> [!danger] Why This Matters
> A request with a missing or unknown `Content-Type` throws a `TypeError` and gets a 500 instead of a 400.

> [!example] Current Code
> ```js
> let rawPaths = req.body.paths;
> ```

> [!tip] Suggested Improvement
> ```js
> let rawPaths = (req.body || {}).paths;
> ```
> This matches the guard every other handler uses.

### Error responses inherit download headers

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** low
**File:** `src/controllers/fs.controller.js:508-527`

`Content-Disposition: attachment` is set before the stream opens, and for single files so is `application/octet-stream`. The ZIP path does the same at lines 650-662.

> [!danger] Why This Matters
> If the stream errors before the first byte, `errorHandler` writes JSON, but the attachment header is still set. The hidden download iframe then saves `{ success:false }` under the original file name.

> [!tip] Suggested Improvement
> Call `res.removeHeader('Content-Disposition')` before `next(...)` in the branch where headers have not been sent yet, or have `errorHandler` clear it.

### Possible double next() on ZIP errors

**Module:** [[HTTP API Layer]]
**Type:** bug-risk
**Severity:** low
**File:** `src/controllers/fs.controller.js:656-690`

The `archive.on('error')` listener calls `next(...)` when headers have not been sent. `await archive.finalize()` can reject with the same error, and the outer `catch` then calls `next(error)` a second time.

> [!danger] Why This Matters
> The second call can raise `ERR_HTTP_HEADERS_SENT`.

> [!tip] Suggested Improvement
> Let one path own the error. For example, set a `failed` flag in the listener, and skip `next` in the `catch` when the flag is already set.

### Filename length counted in UTF-16 units, not bytes

**Module:** [[Storage Services]]
**Type:** bug-risk
**Severity:** low
**File:** `src/utils/validators.js:25`

`trimmed.length > 255` counts UTF-16 code units. ext4 and most POSIX filesystems cap a name at 255 *bytes*.

> [!danger] Why This Matters
> A 120-character CJK name is 360 UTF-8 bytes, so it passes validation. The syscall then fails with `ENAMETOOLONG`, which the services map to a generic 500.

> [!tip] Suggested Improvement
> Use `Buffer.byteLength(trimmed, 'utf8') > 255` instead. The client then gets a clear 400.

### A NUL byte in a client path becomes a 500

**Module:** [[Storage Services]]
**Type:** bug-risk
**Severity:** low
**File:** `src/utils/validators.js:66-80`

`validateClientPath` checks type, length and the leading `/`, but not control characters. Node's fs then throws `ERR_INVALID_ARG_VALUE`.

> [!danger] Why This Matters
> A malformed client request is reported as a "Failed to ..." server error instead of a 400.

> [!tip] Suggested Improvement
> ```js
> if (clientPath.includes('\0')) throw new AppError('Path contains invalid characters.', 400);
> ```
> Reject the NUL byte at the validator, before the path reaches fs.

### Store write failures escape as raw errors

**Module:** [[Metadata and Settings Stores]]
**Type:** bug-risk
**Severity:** low
**File:** `src/services/SettingsService.js:105-144`

`_read` and `_init` wrap their failures in `AppError(…, 500)` with static messages, but `_write` does not. `MetadataService._write` (lines 115-127) has the same gap.

> [!danger] Why This Matters
> `toggleStar` and `SettingsService.replace` propagate a raw `Error` with the path and errno in its message. That is inconsistent with the module's own static-message discipline and with AGENTS.md rule 5.

> [!tip] Suggested Improvement
> ```js
> try { await this._write(validated); }
> catch (error) { const e = new AppError('Settings store could not be written', 500); e.cause = error; throw e; }
> ```
> Wrap the write path in the mutators, and keep the original error as `cause` for logging.

### Settings store is cached raw without shape checks

**Module:** [[Metadata and Settings Stores]]
**Type:** bug-risk
**Severity:** low
**File:** `src/services/SettingsService.js:80-99`

Metadata goes through `normalizeStore` on read. Settings, by contrast, are cached exactly as parsed.

> [!danger] Why This Matters
> A hand-edited document that is valid JSON but the wrong shape (`null`, `[]`, missing `general`) is served to clients as-is. With `null`, `this.cache` stays falsy, so every read hits disk again and `getAll()` returns `null`.

> [!tip] Suggested Improvement
> Run the parsed document through `validateSettingsPayload` on read, and treat a failure as the existing fail-wholly 500. At minimum, reject a root that is not an object.

### Access-policy flags coerced by truthiness

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** low
**File:** `src/services/FileAccessPolicyService.js:30-54`

`isDirectory`, `isPublished` and `isLocked` are stored as `value ? 1 : 0`.

> [!danger] Why This Matters
> A JSON body with `"isPublished": "false"` stores `1`, which is the opposite of what the client meant.

> [!tip] Suggested Improvement
> Reject non-boolean values with a 400, the same way `accessMode` and the date fields are already checked.

### A malformed session cookie becomes a 500

**Module:** [[Auth and Access Control]]
**Type:** bug-risk
**Severity:** low
**File:** `src/middlewares/authenticate.js:10-19`

`decodeURIComponent` throws `URIError` on input such as `afm_session=%E0%A4%A`. `authenticate` is synchronous, so Express forwards the throw.

> [!danger] Why This Matters
> Every protected endpoint answers 500 instead of 401 until the cookie is cleared.

> [!tip] Suggested Improvement
> ```js
> try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
> ```
> Treat a cookie that cannot be decoded as no cookie.

### copyToClipboard reports success when the copy failed

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/app.js:689-705`

When blocked, `document.execCommand('copy')` returns `false` rather than throwing. The function also returns `true` in every branch.

> [!danger] Why This Matters
> The success toast is shown for a copy that did not happen. That breaks the rule against reporting success for an operation that did not happen.

> [!example] Current Code
> ```js
> try { document.execCommand('copy'); Toast.success(successMsg); }
> catch { Toast.error(...); }
> ta.remove(); return true;
> ```

> [!tip] Suggested Improvement
> ```js
> let ok = false;
> try { ok = document.execCommand('copy'); } catch {}
> ta.remove();
> ok ? Toast.success(successMsg) : Toast.error('Copy failed', 'Your browser blocked clipboard access');
> return ok;
> ```
> Use the real return value of `execCommand` both for the toast and for the function's result.

### Overlapping navigations stack leave-confirm dialogs

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/router.js:182-200`

The `navToken` check runs only after `beforeLeave()` resolves.

> [!danger] Why This Matters
> A second click, or a back/forward, while the first leave-confirm is open stacks a second dialog. The token check then abandons the first one.

> [!tip] Suggested Improvement
> Keep a module-level `leavePending` promise. While it is in flight, reuse it or ignore new navigations.

### Stored sidebar width not restored when widening from mobile

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/sidebar.js:103-118`

`init()` applies the stored width only when the viewport is not mobile. `onResize()` restores the collapse preference but never calls `setWidth`. It also re-runs `applyState` on every desktop resize.

> [!danger] Why This Matters
> If the page loads at a width of 860 px or less and the window is then widened, the sidebar keeps the default width until a reload.

> [!tip] Suggested Improvement
> ```js
> // in onResize(), desktop branch
> applyState(stored, false);
> setWidth(AFM?.Store?.get(WIDTH_STORE_KEY, WIDTH_DEFAULT), false);
> ```
> Reapply the stored width in the same branch that restores the collapse state.

### body overflow has three uncoordinated owners

**Module:** [[Frontend Core]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/app.js:453-471`

Modal, the mobile sidebar (`sidebar.js` lines 92 and 100) and the router (`router.js` line 158) each set and clear `document.body.style.overflow` independently.

> [!danger] Why This Matters
> Closing one overlay re-enables page scroll while another is still open, for example a modal opened over the mobile drawer.

> [!tip] Suggested Improvement
> Add a small scroll-lock counter in `app.js` (`AFM.lockScroll()` / `unlockScroll()`) and use it from all three places.

### Upload tray hidden after a page re-init

**Module:** [[Files Page]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/files.js:2800-2822`

`destroy()` lets uploads continue, and `uploads` is module-level state. `init()`, however, never calls `renderUploadTray()`. `updateUploadRow` only patches rows that already exist.

> [!danger] Why This Matters
> After navigating away and back, the tray stays hidden while the upload runs, with no progress and no cancel button. It reappears only when the current job finishes and `runUploads` re-renders.

> [!tip] Suggested Improvement
> Call `renderUploadTray()` in `init()`, after `bindEvents()`.

### Folder-drop read errors silently drop files

**Module:** [[Files Page]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/files.js:2086-2114`

If `readEntries` errors, `readAllEntries` resolves with whatever it has read so far. `fileOf` resolves `null` on error, and `walk` ignores that.

> [!danger] Why This Matters
> A partially unreadable folder is uploaded incompletely, and the user still sees a "complete" toast.

> [!tip] Suggested Improvement
> Count skipped entries in `jobsFromEntries` and include them in `reportUploads`, for example "3 entries could not be read".

### Access-policy modal never settles on Escape

**Module:** [[Files Page]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/files.js:1638-1720`

`pickAccessPolicy` resolves only through its buttons or a backdrop click. Escape calls `Modal.closeAll()`, which only hides the modal. The modal also re-implements the skeleton of `Modal.prompt`.

> [!danger] Why This Matters
> The promise stays pending forever, and the hidden backdrop stays in the DOM with its fixed ids. The next open adds duplicate ids, so the `<label for>` links point at the stale copy.

> [!tip] Suggested Improvement
> Listen for Escape on the backdrop, or watch for `is-open` being removed, and call `finish(null)`. Generate unique ids for each instance.

### Async policy prefill can overwrite operator edits

**Module:** [[Files Page]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/files.js:1709-1718`

The single-item `GET /admin/files/policy` prefill resolves after the modal is already open.

> [!danger] Why This Matters
> If the operator has already changed a field, the response overwrites it, and Save then persists values the operator did not choose.

> [!tip] Suggested Improvement
> Disable the form until the prefill settles, or skip any field the operator has already changed (track it with an `input`/`change` flag).

### Forced destination re-check returns a stale in-flight result

**Module:** [[Feature Pages]]
**Type:** bug-risk
**Severity:** low
**File:** `public/assets/js/uploads.js:598-609`

When a check for the path is already in flight, `verifyDestination` returns that promise even when called with `force: true`. `createFolder` and `recheckAfterFailure` rely on forced checks to see the state after a change.

> [!danger] Why This Matters
> A probe that started before the change can return and cache a pre-change verdict, such as `missing`. A folder that was just created can then be reported as unusable.

> [!tip] Suggested Improvement
> When `force` is set and a check is in flight, chain a fresh check after it: `return known.promise.then(() => verifyDestination(path, { force: true }))`. Alternatively, keep a generation counter so only the newest check writes the cache.

### Failed releases consume retention slots

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** low
**File:** `scripts/deploy.sh:137-155`

After a rolled-back or rollback-failed deploy, the failed release stays on disk and `prune` does not run. Pruning keeps the newest `KEEP_RELEASES` names.

> [!danger] Why This Matters
> Because the failed releases are the newest names, repeated failures are kept, and older known-good releases (other than active and previous) are pruned on the next success.

> [!tip] Suggested Improvement
> After a successful restore, remove the failed release (`chmod -R u+w "$release"; rm -rf -- "$release"`), or leave failed releases out of the retained count.

### Commit epoch unvalidated on deploy and receive paths

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** low
**File:** `scripts/deploy.sh:185-263`

Only `cmd_ssh` checks that the epoch is numeric. A junk epoch passed to `deploy` is written to `.release-epoch`.

> [!danger] Why This Matters
> While that release is active, every later comparison fails the `^[0-9]+$` test, which silently disables the stale-commit guard.

> [!tip] Suggested Improvement
> ```bash
> [[ -z "$epoch" || "$epoch" =~ ^[0-9]+$ ]] || { fail "commit-epoch must be numeric (got '$epoch')"; finish "pre-activation-failed" 2; }
> ```
> Validate the epoch next to the existing SHA check, so every entry point rejects it.

### Lock timeout clobbers the running deploy's record

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** low
**File:** `scripts/deploy.sh:322-326`

When `flock -w` times out, `finish` runs without holding the lock. It overwrites `last-deploy.json` and appends to `deployments.log`.

> [!danger] Why This Matters
> While another deployment is still in progress, `status` reports a `pre-activation-failed` outcome that belongs to no release.

> [!tip] Suggested Improvement
> On a lock timeout, print the outcome line and exit without touching the shared records, or use a distinct `lock-timeout` outcome.

### StartLimitIntervalSec in the wrong unit section

**Module:** [[Deployment Scripts]]
**Type:** bug-risk
**Severity:** low
**File:** `scripts/systemd/dimension.service:32-33`

`StartLimitIntervalSec=` is a `[Unit]` setting. Under `[Service]`, systemd only accepts the legacy names `StartLimitInterval=` and `StartLimitBurst=`.

> [!danger] Why This Matters
> systemd ignores `StartLimitIntervalSec=300` with an "Unknown key" warning and applies the default 10 s interval, so the restart limit is not what the file intends.

> [!tip] Suggested Improvement
> Move both start-limit lines to the `[Unit]` section.

### No error listener on the HTTP server

**Module:** [[Server Bootstrap and Config]]
**Type:** improvement
**Severity:** low
**File:** `server.js:148-155`

No `'error'` listener is attached to `server`.

> [!danger] Why This Matters
> `EADDRINUSE` or `EACCES` crashes with a raw stack trace instead of the boot-error format used for config and DB problems.

> [!tip] Suggested Improvement
> ```js
> server.on('error', (err) => {
>     console.error(`FATAL STARTUP ERROR: cannot listen on port ${config.port}: ${err.code || err.message}`);
>     process.exit(1);
> });
> ```
> A bind failure then reads like every other startup error.

### morgan registered after the limiter and body parsers

**Module:** [[Server Bootstrap and Config]]
**Type:** improvement
**Severity:** low
**File:** `server.js:86-90`

A 429 from the rate limiter ends the middleware chain before `morgan('dev')` runs. A JSON parse error skips straight to `errorHandler`.

> [!danger] Why This Matters
> Rate-limit floods and parse failures, the events an operator most wants to see, never reach the request log.

> [!tip] Suggested Improvement
> ```js
> app.use(morgan('dev'));
> app.use('/api', createRateLimit());
> app.use(express.json());
> ```
> morgan logs when the response finishes, so registering it first costs nothing.

### SPA fallback answers missing assets with index.html

**Module:** [[Server Bootstrap and Config]]
**Type:** improvement
**Severity:** low
**File:** `server.js:113-120`

The fallback serves `index.html` with a 200 for every non-`/api` GET, without checking `Accept`.

> [!danger] Why This Matters
> A mistyped asset path shows up as a MIME/nosniff refusal in the browser instead of a 404. This is harmless at runtime but makes asset regressions harder to diagnose.

> [!tip] Suggested Improvement
> Fall back only when `req.accepts('html')`, or skip paths that have a file extension and let them 404.

### Stale doc comment in dataDir.js

**Module:** [[Server Bootstrap and Config]]
**Type:** improvement
**Severity:** low
**File:** `src/config/dataDir.js:9-11`

The comment says `config/env` "exits without STORAGE_ROOT". That exit has moved into `validateStartup`.

> [!danger] Why This Matters
> The comment misstates current behaviour, and AGENTS.md treats stale docs as bugs.

> [!tip] Suggested Improvement
> Reword it to "unlike config/env, which loads `.env` on require".

### getSummary doc comment overstates degradation

**Module:** [[HTTP API Layer]]
**Type:** improvement
**Severity:** low
**File:** `src/controllers/dashboard.controller.js:110-125`

The JSDoc says that no capability can fail the whole response. But `getTreeStats` and `getVolumeStats` run in a bare `Promise.all`, so a rejection from either one is a 500.

> [!danger] Why This Matters
> Readers trust a degradation guarantee that the code does not provide.

> [!tip] Suggested Improvement
> Correct the comment, or deliberately wrap each call as its own capability.

### errorHandler does not guard res.headersSent

**Module:** [[HTTP API Layer]]
**Type:** improvement
**Severity:** low
**File:** `src/middlewares/errorHandler.js:24-43`

If an error reaches the handler after a response has started streaming, `res.status().json()` throws. Controllers guard against this themselves today.

> [!danger] Why This Matters
> The global handler is the safety net, and it does not cover this case.

> [!tip] Suggested Improvement
> ```js
> if (res.headersSent) return next(err); // let Express close the connection
> ```
> Delegate to Express's default handler once the response has started.

### Bulk partial-failure loop triplicated

**Module:** [[HTTP API Layer]]
**Type:** improvement
**Severity:** low
**File:** `src/controllers/fs.controller.js:311-485`

`moveItems`, `copyItems` and `deleteItems` repeat the same pieces:
- array and size validation;
- the per-item try/catch;
- the `failed[]` shape;
- the all-failed rethrow.

> [!danger] Why This Matters
> Any fix, such as the sanitization fix for the bulk handlers above, has to be made three times.

> [!tip] Suggested Improvement
> Extract `runBulk(paths, worker)`, returning `{ ok, failed }`, plus a shared `assertPathList(paths)`.

### errorOnExist is a no-op in the copy call

**Module:** [[Storage Services]]
**Type:** improvement
**Severity:** low
**File:** `src/services/FileSystemService.js:290`

Node honours `errorOnExist` only when `force` is `false`, and `force` defaults to `true`.

> [!danger] Why This Matters
> A writer that creates the target between the `exists` check and `fs.cp` gets its files silently overwritten.

> [!tip] Suggested Improvement
> Pass `force: false` alongside `errorOnExist: true`, and map `ERR_FS_CP_EEXIST` to 409.

### validateFileName trims before the space rule

**Module:** [[Storage Services]]
**Type:** improvement
**Severity:** low
**File:** `src/utils/validators.js:14-52`

The final regex runs on `trimmed`, so only leading or trailing dots can ever match.

> [!danger] Why This Matters
> `" report.pdf "` is accepted and saved as `"report.pdf"`, a different name from the one the client sent, with no indication.

> [!example] Current Code
> ```js
> if (/^[.\s]|[.\s]$/.test(trimmed)) { ... }
> ```

> [!tip] Suggested Improvement
> ```js
> if (/^[.\s]|[.\s]$/.test(name)) { ... }
> ```
> Test the untrimmed name, so the project's "reject leading or trailing spaces" rule actually applies. If the trimming is intentional, document it as normalisation instead.

### Upload limits bypass the validated config

**Module:** [[Storage Services]]
**Type:** improvement
**Severity:** low
**File:** `src/services/UploadService.js:52-57`

`UPLOAD_MAX_BYTES` is parsed a second time from `process.env`, and `AFM_UPLOAD_MAX_CONCURRENT` is read from `process.env` on every request. The comment above says both are read from the validated config.

> [!danger] Why This Matters
> Two parsers for the same value can drift apart.

> [!tip] Suggested Improvement
> Expose `uploadMaxBytes` and `uploadMaxConcurrent` on `config` and read them there, as `uploadFreeSpaceBytes` already is.

### Dead UNRESOLVED branch in getTreeStats

**Module:** [[Storage Services]]
**Type:** improvement
**Severity:** low
**File:** `src/services/FileSystemService.js:388-398`

`resolveSecurePath` only throws `AppError`, so the `UNRESOLVED` push can never run. `startSecurePath` is assigned but never used.

> [!danger] Why This Matters
> The dead code suggests a failure mode that cannot occur.

> [!tip] Suggested Improvement
> Replace the block with a bare `PathService.resolveSecurePath(startClientPath);`. The guard call is the only effect needed.

### Duplicated store skeleton

**Module:** [[Metadata and Settings Stores]]
**Type:** improvement
**Severity:** low
**File:** `src/services/SettingsService.js:63-117`

`_init`, `_read` and `_write` are copied almost verbatim from `MetadataService` (lines 72-127).

> [!danger] Why This Matters
> Every store fix, including the write queue and the write wrapping, has to be made twice.

> [!tip] Suggested Improvement
> Extract a small `JsonStore` helper that takes `{ fileName, defaults, normalize, label }`.

### CSRF comparison not constant-time; body fallback accepted everywhere

**Module:** [[Auth and Access Control]]
**Type:** improvement
**Severity:** low
**File:** `src/middlewares/csrf.js:22-23`

`presented !== req.session.csrf_secret` is a short-circuit string comparison. `body.csrfToken` is accepted on every route, not only on the form POST for downloads, and it is not checked to be a string.

> [!danger] Why This Matters
> This leaves a timing side channel on the comparison, and an alternate token source that is broader than its justification.

> [!tip] Suggested Improvement
> Require a string, compare with `crypto.timingSafeEqual` on buffers of equal length, and optionally limit the body-field fallback to `POST /fs/download-zip`.

### Synchronous SQLite write on every request

**Module:** [[Auth and Access Control]]
**Type:** improvement
**Severity:** low
**File:** `src/services/SessionService.js:54-62`

`validateSession` calls `touch()` on every request, including Dashboard polling.

> [!danger] Why This Matters
> Each touch is a blocking write and journal sync on the event loop, made only to keep an informational timestamp current.

> [!tip] Suggested Improvement
> ```js
> if (Date.now() - session.last_seen_at > 60_000) SessionRepository.touch(session.id);
> ```
> Throttle the touch, since `last_seen_at` only needs to be roughly current.

### Session TTL and rate parser duplicated

**Module:** [[Auth and Access Control]]
**Type:** improvement
**Severity:** low
**File:** `src/routes/auth.routes.js:27-31`

The 24 h TTL is defined in both `auth.controller.js` and `SessionService.js`. `perMinute` is copied from `rateLimit.js`.

> [!danger] Why This Matters
> The cookie `Max-Age` can drift from the server-side expiry.

> [!tip] Suggested Improvement
> Export `SESSION_TTL_MS` from `SessionService` (the cookie uses it divided by 1000) and export `perMinute` from `rateLimit.js`.

### Audit write in a catch can mask the original error

**Module:** [[Auth and Access Control]]
**Type:** improvement
**Severity:** low
**File:** `src/controllers/users.controller.js:36-94`

The failure-path `audit()` call is a synchronous DB insert that runs before `next(error)`. `filePolicy.controller.js` has the same pattern.

> [!danger] Why This Matters
> If the insert throws, for example because the database is locked, the original 400 or 404 `AppError` is replaced by a 500.

> [!tip] Suggested Improvement
> Wrap the failure-path audit call in its own `try { ... } catch {}`.

### Bootstrap reads are serial and noisy

**Module:** [[Frontend Core]]
**Type:** improvement
**Severity:** low
**File:** `public/assets/js/app.js:997-1031`

`/auth/me`, `/dashboard/summary` and `/settings` are awaited one after another, though only `/auth/me` is a prerequisite. The summary read is not silent, and the later reads still fire after a 401.

> [!danger] Why This Matters
> Page load is slower than it needs to be. A corrupt metadata store pops a "Network Error" toast on every page load, even though the sidebar meter it feeds already has an honest unavailable state.

> [!tip] Suggested Improvement
> After `/auth/me`, run the other two reads with `Promise.allSettled` and pass `{ silent: true }` to the summary read. Return early when `/auth/me` answers 401.

### initApp duplicates refreshChrome

**Module:** [[Frontend Core]]
**Type:** improvement
**Severity:** low
**File:** `public/assets/js/app.js:1124-1148`

`initApp` re-implements `refreshChrome` line for line: icons, active nav, scroll reveal and the `.kbd-mod` platform hint.

> [!danger] Why This Matters
> A change to one copy silently diverges from the other.

> [!tip] Suggested Improvement
> ```js
> function initApp() {
>   Dropdown.init(); initModalBindings(); initCopyButtons(); initShortcuts(); attachRipples();
>   refreshChrome();
>   loadGlobalData();
>   document.documentElement.classList.add('is-ready');
> }
> ```
> Call the shared function instead of copying it.

### Star failures show two toasts

**Module:** [[Files Page]]
**Type:** improvement
**Severity:** low
**File:** `public/assets/js/files.js:1759-1760`

`API.post('/fs/star', …)` is not marked silent. `pasteItems` and `setAccessPolicy`, by contrast, go silent and report once.

> [!danger] Why This Matters
> A failure shows the generic `api.js` error toast and then this function's own summary warning.

> [!tip] Suggested Improvement
> Call `window.API.post('/fs/star', { path: f.path, starred: target }, { silent: true })`.

### Settings header claims a consumer that does not exist

**Module:** [[Feature Pages]]
**Type:** improvement
**Severity:** low
**File:** `public/assets/js/settings.js:5-10`

The module header says `general.defaultUploadFolder` feeds the Uploads page destination. `uploads.js` never reads it, and the project rules state it is not yet read by any page.

> [!danger] Why This Matters
> The comment misleads anyone tracing what the setting does.

> [!tip] Suggested Improvement
> Reword it to "validated and stored; not yet read by any page", or wire `initDestination()` in `uploads.js` to seed `state.destination` from `GET /settings`.

### "Superseded" contract differs from the code

**Module:** [[Deployment Scripts]]
**Type:** improvement
**Severity:** low
**File:** `scripts/deploy.sh:24-202`

The header says exit 5 means "an equal-or-newer commit is already active". The guard is `(( epoch < active_epoch ))`, so an equal epoch proceeds.

> [!danger] Why This Matters
> Operators reading the header will expect a redeploy of the same commit to be refused, and it is not.

> [!tip] Suggested Improvement
> Align the comment ("a newer commit is already active") or the comparison, whichever is intended.

### APP_ROOT containment check is lexical

**Module:** [[Deployment Scripts]]
**Type:** improvement
**Severity:** low
**File:** `scripts/deploy.sh:234-235`

`case "$data_dir/" in "$APP_ROOT"/*)` compares raw strings.

> [!danger] Why This Matters
> A `..` segment, or a symlink pointing into `$APP_ROOT/releases`, passes the "must live outside APP_ROOT" rule. The store could then be pruned along with a release.

> [!tip] Suggested Improvement
> ```bash
> real="$(realpath -e -- "$data_dir")"; case "$real/" in "$(realpath -e -- "$APP_ROOT")"/*) ...
> ```
> Compare canonical paths instead of raw strings.

### SSH_OPTS relies on unquoted word-splitting

**Module:** [[Deployment Scripts]]
**Type:** improvement
**Severity:** low
**File:** `scripts/trigger-deploy.sh:77-78`

The deliberately unquoted `${SSH_OPTS}` also undergoes pathname expansion. The post-receive hook takes the value straight from `dimension.sshOpts`.

> [!danger] Why This Matters
> Glob characters expand against the working directory, and any key path containing a space breaks.

> [!tip] Suggested Improvement
> Use `read -r -a ssh_opts <<< "${SSH_OPTS:-}"` with `ssh "${ssh_opts[@]}" ...`, or recommend an `~/.ssh/config` host alias so no options need to be passed.

### Package directory leaks on failure

**Module:** [[Deployment Scripts]]
**Type:** improvement
**Severity:** low
**File:** `scripts/trigger-deploy.sh:46-79`

Every `die` between packaging and line 79 exits without removing the `mktemp -d` directory.

> [!danger] Why This Matters
> Failed runs pile up artifacts in `$TMPDIR`.

> [!tip] Suggested Improvement
> Register the cleanup with an `EXIT` trap once the directory is created. The trap must respect the ownership rule from the `OUT_DIR` fix above.
