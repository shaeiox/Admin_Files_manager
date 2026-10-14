---
module: Frontend Core
slug: frontend-core
purpose: Shared SPA runtime: API client, UI toolkit, client router, sidebar, theme, notifications and base CSS design system.
roots:
  - public/assets/js/
  - public/assets/css/
language: javascript
complexity: medium
loc: 6438
files:
  - public/assets/js/api.js
  - public/assets/js/app.js
  - public/assets/js/router.js
  - public/assets/js/sidebar.js
  - public/assets/js/theme.js
  - public/assets/js/notifications.js
  - public/assets/css/tokens.css
  - public/assets/css/base.css
  - public/assets/css/themes.css
  - public/assets/css/layout.css
  - public/assets/css/components.css
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
A no-build, browser-global module set. Each JS file is an IIFE (or plain top-level script, in `app.js`) that attaches one namespace to `window`: `window.API`, `window.AFM`, `window.Router`, `window.Sidebar`, `window.Theme`, and `AFM.Notifications`. Script tag order matters: `theme.js` runs in `<head>` (phase-1 bootstrap sets `data-theme` before first paint), then `app.js`, `api.js`, `sidebar.js`, `notifications.js`, page modules, and finally `router.js`.

Control flow enters on `DOMContentLoaded`: `app.js#initApp` hydrates icons, installs delegated document listeners (dropdowns, modals, copy buttons, shortcuts, ripples), marks the active nav item and calls `loadGlobalData()` (GET `/auth/me` → `API.setCsrfToken`, GET `/dashboard/summary` → sidebar storage meter, GET `/settings` → workspace name). `initApp` is skipped on the login page. `Sidebar.init` and `Theme.init` auto-run on the same event; `Router.start()` runs at script parse.

`router.js` turns the five static pages (`index.html`, `files.html`, `uploads.html`, `settings.html`, `admin.html`) into an SPA: it intercepts same-origin link clicks, fetches and caches the target HTML, loads missing stylesheets/scripts in order, calls the leaving module's `beforeLeave()` / `destroy()`, swaps the children of `<main class="main-area">` plus page-owned body extras (the sidebar persists), pushes history, then calls `AFM.refreshChrome()`, `Theme.refresh()` and the new module's `init()`. Any failure falls back to `window.location.assign`. Exit points to the server are all through `window.API`.

CSS is a layered design system: `tokens.css` (raw color/spacing/type custom properties + Google Fonts DM Sans/Inter imports) → `themes.css` (semantic `--bg-*`/`--text-*` variables for dark default, `prefers-color-scheme: light`, and forced `[data-theme]` overrides; comments in Persian) → `base.css` (reset, typography, scrollbars, utilities, keyframes, breakpoints) → `layout.css` (app shell, sidebar incl. storage meter / collapse / resize handle, main area, topbar, breadcrumb, page header, grid, mobile overlay, responsive) → `components.css` (buttons, cards, forms, switch, segmented control, tags, dropdown, modal, toast, progress, tooltip with `data-tip-pos` placement variants, tabs, avatar, empty state, skeleton, pagination, context menu).

<!-- c2d:s2 -->
### Public API
`window.API` (frozen; `api.js`):
```js
API.BASE_URL: string            // resolved once: window.AFM_API_BASE → <meta name="afm-api-base"> → '/api/v1'
API.get(endpoint, opts?) / API.post(endpoint, body, opts?) / API.put(endpoint, body, opts?) / API.del(endpoint, body?, opts?) -> Promise<any>
```
JSON fetch wrapper; opts `silent` (no toast), `skipAuthRedirect`; rejects with `Error{status, kind?}`; adds `X-CSRF-Token` on non-GET/HEAD; 401 clears token and redirects to `login.html?redirect=`.
```js
API.upload(endpoint, formData, onProgress?) -> { promise, abort }
```
XHR multipart upload with progress; transport failures carry `kind: 'network' | 'aborted'`.
```js
API.downloadFile(clientPath) / API.downloadMultipleFiles(paths, {gapMs?}) / API.downloadZip(paths)
```
Hidden-iframe GET `/fs/download`; staggered iframes; hidden form POST to `/fs/download-zip` targeted at an iframe, CSRF token as `csrfToken` body field.
```js
API.thumbnailUrl(clientPath, size) -> string
API.setCsrfToken(token) / API.clearCsrfToken() / API.redirectToLogin()
```

`window.AFM` (`app.js`):
```js
AFM.Icons, AFM.icon(name, size?, cls?), AFM.hydrateIcons(root?)      // inline SVG icon set, [data-icon] hydration
AFM.$, AFM.$$, AFM.el(tag, attrs, html), AFM.on(target, evt, sel, handler)  // DOM helpers, delegation
AFM.Format.{bytes, bytesParts, compact, number, speed, duration, date, dateTime, relative, percent, pad, middle}
AFM.FileTypes, AFM.resolveType(filename, isFolder?)                  // extension → type/icon/colour
AFM.Toast.show(type,title,msg,duration) (+ success/error/... helpers) // stacked toasts, max 4, hover-pause
AFM.Modal.{open, close, closeAll, confirm({...}) -> Promise<bool>, prompt({...}) -> Promise<string|null>}  // title/message/value inserted as raw HTML
AFM.Dropdown.{init, closeAll}, AFM.ContextMenu.{show(x,y,items), hide}
AFM.copyToClipboard, AFM.Store.{get,set,remove}                       // localStorage JSON wrapper
AFM.debounce, AFM.throttle, AFM.uid, AFM.clamp, AFM.randBetween, AFM.escapeHtml, AFM.countUp, AFM.initScrollReveal
AFM.refreshChrome(root?)                                             // re-run per-page chrome after a router swap
AFM.resolveStorageDisplay(storage), AFM.updateStorageUI(storage)     // pure resolver + sidebar meter renderer (null → unavailable)
AFM.resolveIdentityDisplay(me), AFM.updateUserUI(me)
AFM.applyWorkspaceName(name)                                         // textContent write to .brand-name, default 'Dimension'
AFM.Notifications.{bindTopbarBell, open(bell?), close, isOpen}       // notifications.js; activity panel from /dashboard/summary
```

`window.Router` (`router.js`):
```js
Router.navigate(href, { push = true }?) -> Promise<void>
Router.resolve(href) -> { url, file } | null
```
Page-module contract consumed: `window[Dashboard|Files|Uploads|Settings|Admin].init()`, optional `destroy()`, optional async `beforeLeave() -> boolean`.

`window.Sidebar` (`sidebar.js`): `init, toggle, collapse, expand, getState() -> {collapsed, mobileOpen, mobile}, onChange(fn) -> unsubscribe`.

`window.Theme` (`theme.js`): `init, toggle, set(theme), get, isDark, onChange(fn) -> unsubscribe, refresh`.

DOM/CSS hooks: `.theme-toggle`, `[data-theme-toggle]`, `.theme-option[data-theme-value]`, `[data-modal-open]`, `[data-modal-close]`, `[data-copy]`, `[data-action="logout"]`, `.mobile-menu-btn`, `.topbar [data-tip="Notifications"]`, `[data-icon]`, `[data-reveal]`, `[data-tip]` / `data-tip-pos`, CSS custom property `--sidebar-width`, root classes `is-ready`, `is-navigating`, `theme-switching`.

<!-- c2d:s3 -->
### Internal Patterns
- **IIFE singletons on `window`**, closure-held state; no ES modules or bundler. `API` is `Object.freeze`d so `BASE_URL` cannot be repointed.
- **Single network boundary**: all API URLs are built inside `api.js`; non-fetch transports (iframe, form, `<img>`) get named builders. CSRF token held in a closure variable, never persisted; re-fetched on each load via `/auth/me`.
- **Machine-readable errors**: rejected errors carry `status` (0 = no response) and server-provided `kind`; callers are expected not to parse messages.
- **Delegated document listeners** so controls inside router-swapped markup (topbar bell, mobile menu, theme toggles, modals) keep working; `Notifications.bindTopbarBell` and `Theme.init` guard against double-binding with flags.
- **Router concurrency guard**: a monotonically increasing `navToken` lets a newer navigation supersede an older in-flight one; an HTML `Map` cache of fetch promises (evicted on failure) is warmed on `pointerover`/`focusin` intent. Child nodes are snapshotted before `adoptNode`. Teardown also closes shared overlays (ContextMenu, Dropdown, Modal, Notifications) and clears `inert`/`aria-hidden`/`overflow` left on the shell.
- **Two-phase theme init**: synchronous bootstrap at parse time to avoid flash, then listeners (`matchMedia` change, cross-tab `storage` event). Theme is browser-local (`localStorage['afm:theme']`), deliberately not in the server settings store.
- **Honest-unavailable rendering**: `resolveStorageDisplay` / `resolveIdentityDisplay` are pure resolvers returning a view model; unmeasured volume renders `—` with no `aria-valuenow` and an outlined (not filled) bar; storage severity thresholds 75%/90%.
- **Fire-and-forget bootstrap reads**: `loadGlobalData` isolates each of its three reads in its own try/catch; settings read is silent and failure leaves static markup.
- **Sidebar persistence** via `AFM.Store` (`sidebar-collapsed`, `sidebarWidth`, clamped 200–420 px), pointer-capture drag resize plus keyboard arrow resize on an ARIA `separator`, swipe-from-edge on mobile (breakpoint 860 px).
- Deviation: `theme.js` is intentionally dependency-free and uses `localStorage` directly instead of `AFM.Store`; `sidebar.js` and `notifications.js` depend on `AFM` being loaded first.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - HTTP API Layer — endpoints called: `GET /auth/me`, `POST /auth/logout`, `GET /dashboard/summary`, `GET /settings`, `GET /fs/download`, `POST /fs/download-zip`, `GET /fs/thumbnail`; plus generic `get/post/put/del/upload` used by page modules. Response contract: `{success:false, error, kind?}` errors, 401 for missing session, CSRF header/body field.
   - Page modules (Files Page, Feature Pages) are consumers, not dependencies; `router.js` references their globals (`Dashboard`, `Files`, `Uploads`, `Settings`, `Admin`) by name only.
2. **Third-party packages**
   - Google Fonts (DM Sans, Inter) via `@import` in `tokens.css` — typography. No JS libraries.

<!-- c2d:s5 -->
### Complexity
Medium. The code is mostly straightforward DOM utilities and CSS, but several pieces carry real state and ordering concerns: client-side navigation with superseding tokens, asset injection and teardown; CSRF/session handling and 401 redirects; download transports that avoid main-frame navigation; and a large, multi-layer CSS theme system (~3,600 lines). The most complex file is `public/assets/js/router.js`, specifically `navigate()`: it interleaves async `beforeLeave` vetoes (with history restoration on back/forward), cached document fetches, ordered script loading, stale-navigation checks at three await points, a `finally`-based loading flag, fallback to full page loads, and the DOM swap / module lifecycle sequence. `app.js` is the largest JS file (1,177 lines) but is a flat collection of independent helpers.

<!-- c2d:s6 -->
### Key Files
- `public/assets/js/api.js` — the sole HTTP/CSRF boundary: JSON fetch wrapper, XHR upload, iframe/form download transports, base-URL resolution.
- `public/assets/js/app.js` — `window.AFM` toolkit (icons, format, toast, modal, dropdown, context menu, escapeHtml) and global bootstrap (`initApp`, `loadGlobalData`, sidebar storage/identity rendering).
- `public/assets/js/router.js` — no-reload page navigation and page-module lifecycle (`init`/`destroy`/`beforeLeave`).
- `public/assets/js/sidebar.js` — collapse, mobile drawer, drag/keyboard resize, logout.
- `public/assets/js/theme.js` — flash-free light/dark theme bootstrap and toggles, browser-local persistence.
- `public/assets/css/themes.css` — semantic color variables for dark/light/system/forced themes.
- `public/assets/css/components.css` — shared component styles including tooltip placement variants.

<!-- c2d:s7 -->
### Limitations & Improvements

1. **Bug or Risk — Escape / router teardown strands `Modal.confirm` and `Modal.prompt` promises** (medium)
   `public/assets/js/app.js` lines 446-573 and 844-849. `confirm()`/`prompt()` resolve only through their own `finish()` (buttons, backdrop click, Enter). The global Escape shortcut calls `Modal.closeAll()`, and `router.js#teardown` does the same on every navigation; `closeAll()` just strips `is-open`. The promise never settles and the backdrop node is never removed, so any caller awaiting it (for example a page's `beforeLeave()` confirm, or a delete confirm) hangs forever and hidden backdrops accumulate in `<body>`. Pressing Escape inside the prompt's input bubbles to the same document listener.
   Fix: keep a registry of pending dialogs and settle them from `closeAll()`.
   ```js
   // before
   function closeAll() {
     $$('.modal-backdrop.is-open').forEach(b => b.classList.remove('is-open'));
     ...
   }
   // after
   const pending = new Set();             // cancel callbacks of open confirm/prompt dialogs
   function closeAll() {
     pending.forEach(cancel => cancel()); // resolves false / null and removes the node
     $$('.modal-backdrop.is-open').forEach(b => b.classList.remove('is-open'));
     ...
   }
   // in confirm(): const cancel = () => finish(false); pending.add(cancel); finish() deletes it
   ```

2. **Bug or Risk — "System" theme cannot stay selected** (medium)
   `public/assets/js/theme.js` lines 104-113, 176-208, 220-238, 267-270. Choosing the `system` picker card removes the stored key and then calls `apply(systemTheme)`, but `apply()` unconditionally writes the concrete `'light'`/`'dark'` back to `localStorage` whenever the theme actually changes; `onSystemChange` does the same. So System mode survives only if the OS theme already equals the current one, and is lost on the first OS change. `refresh()` (run after every router swap) and `apply()` also call `updatePickerCards(current)`, which marks the Light/Dark card active instead of System.
   Fix: separate the stored preference from the applied theme; persist only on explicit user choices.
   ```js
   // before
   try { localStorage.setItem(STORE_KEY, JSON.stringify(theme)); } catch (e) {}
   // after: apply(theme, animate, persist = true)
   if (persist) try { localStorage.setItem(STORE_KEY, JSON.stringify(theme)); } catch (e) {}
   // onSystemChange and the 'system' card call apply(t, true, false);
   // updatePickerCards marks 'system' active when no key is stored
   ```

3. **Improvement Opportunity — Shared widgets insert caller strings as raw HTML** (medium)
   `public/assets/js/app.js` lines 485-503, 530-550 (`Modal.confirm` / `Modal.prompt`: `title`, `message`, `label`, `hint`, `value`, `placeholder`, button text) and 645-655 (`ContextMenu.show`: `label`, `shortcut`). With CSP disabled, safety depends on every caller remembering to `escapeHtml` filesystem-derived names; the `value="${value}"` attribute is especially easy to break with a `"` in a filename. The contract is documented in AGENTS.md, but an escape-by-default API removes the failure mode instead of policing it. `Toast` already escapes (lines 398-399), so the toolkit is inconsistent.
   Fix: escape by default with an explicit opt-in for trusted markup (e.g. `messageHtml`), or set fields with `textContent` / `input.value` after building the skeleton.
   ```js
   // before
   <input class="input" type="text" value="${value}" ...>
   // after
   const input = backdrop.querySelector('input'); input.value = value;
   ```

4. **Limitation — Download failures are invisible to the user** (medium)
   `public/assets/js/api.js` lines 288-400. `downloadFile` / `downloadMultipleFiles` / `downloadZip` load into hidden iframes; a 401, 403 (e.g. missing CSRF token on the ZIP form), 404 or 500 renders into a 0x0 iframe and is silently discarded after 60 s / 15 s. Callers get no promise and no error signal, so the UI cannot report a failed download.
   Fix: listen for the iframe `load` event (it fires when the response rendered as a document, i.e. an error body, not an attachment) and surface an error, or return a promise that rejects on that signal.

5. **Bug or Risk — `copyToClipboard` reports success when the copy failed** (low)
   `public/assets/js/app.js` lines 689-705. In the fallback path `document.execCommand('copy')` returns `false` rather than throwing when blocked, so the success toast is shown anyway, and the function returns `true` in every branch. This contradicts the project rule "no success message for an operation that did not happen".
   ```js
   // before
   try { document.execCommand('copy'); Toast.success(successMsg); }
   catch { Toast.error(...); }
   ta.remove(); return true;
   // after
   let ok = false;
   try { ok = document.execCommand('copy'); } catch {}
   ta.remove();
   ok ? Toast.success(successMsg) : Toast.error('Copy failed', 'Your browser blocked clipboard access');
   return ok;
   ```

6. **Improvement Opportunity — Bootstrap reads are serial and the summary read toasts** (low)
   `public/assets/js/app.js` lines 997-1031. `/auth/me`, `/dashboard/summary` (a tree walk) and `/settings` are awaited one after another; only the first is a prerequisite (CSRF token). The summary read is not `silent`, so a corrupt metadata store (a 500 by contract) pops a "Network Error" toast on every page load for a sidebar meter that already has an honest unavailable state. After a 401 on `/auth/me`, the two later reads still fire.
   Fix: after `/auth/me`, run the other two with `Promise.allSettled`, pass `{ silent: true }` to the summary read, and return early when `/auth/me` failed with status 401.

7. **Limitation — CSRF token only exists after `/auth/me` resolves, with no recovery** (low)
   `public/assets/js/api.js` lines 55-65, 111-113, 223, 382-388; `public/assets/js/app.js` lines 1004-1007. A mutating request issued before the bootstrap read completes (or after the token rotates through a re-login in another tab) is sent without or with a stale token and fails with 403; there is no refresh-and-retry, and `downloadZip` silently omits the field.
   Fix: expose a `ready` promise from the `/auth/me` read that `request()` awaits for non-GET methods, and on a CSRF 403 refetch `/auth/me` once and retry.

8. **Bug or Risk — Overlapping navigations can each run `beforeLeave()`** (low)
   `public/assets/js/router.js` lines 182-200. The `navToken` check happens only after `beforeLeave()` resolves. A second link click (or back/forward) while the first navigation's leave-confirm is open calls `beforeLeave()` again, stacking a second confirm dialog; the first is then abandoned by the token check.
   Fix: keep a module-level `leavePending` promise and reuse it (or ignore new navigations) while one is in flight.

9. **Limitation — Page HTML cache never invalidates** (low)
   `public/assets/js/router.js` lines 35, 58-70. Fetched page HTML is cached for the document's lifetime; only failures are evicted. A tab left open across a deploy keeps swapping in pre-deploy markup against the scripts it already loaded, until a full reload.
   Fix: acceptable for an admin tool; if releases matter, key the cache on a version marker (e.g. `apiVersion` from `/health`) or expire entries after N minutes.

10. **Bug or Risk — Sidebar width not restored after starting on a narrow viewport** (low)
    `public/assets/js/sidebar.js` lines 103-118, 286-291. `init()` applies the stored `sidebarWidth` only when not mobile; `onResize()` restores the collapse preference on desktop but never calls `setWidth`. Loading at <=860 px and widening the window leaves the default width until reload. `onResize()` also re-runs `applyState` (store write plus listener notification) on every desktop resize.
    ```js
    // in onResize(), desktop branch
    applyState(stored, false);
    setWidth(AFM?.Store?.get(WIDTH_STORE_KEY, WIDTH_DEFAULT), false);
    ```

11. **Bug or Risk — `document.body.style.overflow` has three uncoordinated owners** (low)
    `public/assets/js/app.js` lines 453, 465, 471; `public/assets/js/sidebar.js` lines 92, 100; `public/assets/js/router.js` line 158. Modal, mobile sidebar and router each set/clear the inline overflow independently, so closing one (e.g. a modal opened over the open mobile drawer) re-enables page scroll while the other overlay is still up.
    Fix: a small scroll-lock counter in `app.js` (`AFM.lockScroll()` / `unlockScroll()`) used by all three.

12. **Limitation — Fonts load from Google at runtime** (low)
    `public/assets/css/tokens.css` lines 6-7. A self-hosted admin tool depends on `fonts.googleapis.com` via render-blocking `@import`; offline or air-gapped installs wait on a failing request before falling back to system fonts, and every page view exposes the operator's IP to a third party.
    Fix: vendor the two families under `public/assets/fonts/` with `@font-face` and `font-display: swap`.

13. **Improvement Opportunity — Duplicated chrome logic in `initApp`** (low)
    `public/assets/js/app.js` lines 1124-1148. `initApp` re-implements `refreshChrome` (icons, active nav, scroll reveal, `.kbd-mod` platform hint) line for line; a change to one silently diverges from the other.
    ```js
    // after
    function initApp() {
      Dropdown.init(); initModalBindings(); initCopyButtons(); initShortcuts(); attachRipples();
      refreshChrome();
      loadGlobalData();
      document.documentElement.classList.add('is-ready');
    }
    ```
