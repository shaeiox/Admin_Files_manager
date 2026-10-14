---
title: Re-entrant Page Lifecycle
type: pattern
language:
  - javascript
status: generated
complexity: high
dependencies:
  - "[[Frontend Core]]"
  - "[[Files Page]]"
  - "[[Feature Pages]]"
related-notes:
  - "[[Concurrency and Consistency]]"
  - "[[Singleton Services]]"
  - "[[Bounded Work Budgets]]"
canonical-source: public/assets/js/router.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - pattern
---

# Re-entrant Page Lifecycle

## What it is

`router.js` swaps pages **in place**: no full reload, the same document, the same `window`. A page module's `init()` can therefore run many times per document, and its IIFE closure survives between visits. The contract:

- `init()` resets module state, for example from `createState()`.
- Every `window` / `document` listener and timer the page adds is **tracked** and removed in `destroy()`.
- An optional `beforeLeave()` can cancel navigation, e.g. for unsaved settings.
- Shared chrome (topbar bell, theme toggle, mobile menu, modals) binds once by **document-level delegation**, guarded against double binding.
- Async results that arrive after a newer request, or after navigation, are dropped using **monotonic request ids or nav tokens**.

## Why this codebase uses it

- ADR-005: page modules gain a lifecycle in which *"`init()` may run many times per document; `destroy()` removes every `window`/`document` listener and timer the module added; an optional `beforeLeave()` can cancel"*. ADR-005 also names the consequence: a page that adds a global listener without removing it *"now leaks across"* pages.
- AGENTS.md rule 8: *"every `window`/`document` listener and timer it adds must be removed by its `destroy()`, and controls in the topbar must be bound by delegation in shared code. A new page must be added to `PAGES`/`MODULES` in `router.js`."*

## Where it appears

- [[Frontend Core]]:
  - `public/assets/js/router.js` keeps a `navToken` so a newer navigation supersedes an older one. It caches page HTML promises. Teardown calls `destroy()`, closes `ContextMenu` / `Dropdown` / `Modal` / `Notifications`, and clears `inert` / `aria-hidden` / `overflow`.
  - `Notifications.bindTopbarBell` and `Theme.init` use double-bind flags.
- [[Files Page]]: `public/assets/js/files.js` uses `listenGlobal()` with `globalListeners`, `++listRequestId` / `++treeRequestId` checked after every `await`, and a `destroy()` that also removes injected `<style>` sheets and cancels the pending search timer.
- [[Feature Pages]]:
  - `public/assets/js/settings.js` and `admin.js` use `listen()` with `globalListeners`.
  - `dashboard.js` stores `onQuickClick` and stops health polling in `destroy()`.
  - `uploads.js` uses named drag handlers.

## Code excerpt

> [!example] `public/assets/js/files.js`: tracked global listeners
> ```js
> function listenGlobal(target, type, handler, options) {
>   target.addEventListener(type, handler, options);
>   globalListeners.push([target, type, handler, options]);
> }
> // ...
> function destroy() {
>   globalListeners.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
>   globalListeners = [];
>   cancelPendingSearch();
>   // ... remove injected width sheets, has-bulk-bar class
> }
> ```

> [!example] `public/assets/js/router.js`: stale navigation guard
> ```js
> const token = ++navToken;
> // ... await beforeLeave(), fetch page HTML ...
> if (token !== navToken) return;
> ```

## Pitfalls and known violations

> [!warning] Async work that outlives `destroy()`
> Dashboard `init()` returns `loadSummary().then(ok => { if (ok) startHealthPolling(); })`. If the user navigates away first, `destroy()` runs while there is no timer to stop. The late `.then` then starts a 5 s interval on a page that is gone, and `GET /dashboard/health` keeps firing on every other page until reload (Feature Pages, "Dashboard health poll can start after the page has been destroyed", medium). Fix: an `alive` flag that `destroy()` clears and every async start checks.

> [!warning] Teardown that never settles promises
> `Modal.closeAll()` is called by router teardown and by the Escape shortcut. It only strips `is-open`, so pending `Modal.confirm` / `Modal.prompt` promises never resolve and hidden backdrops accumulate. A `beforeLeave()` confirm can hang navigation (Frontend Core, medium).

- **Overlapping navigations.** The `navToken` check runs only *after* `beforeLeave()`, so a second click stacks a second confirm (Frontend Core, low).
- **Module state that survives on purpose must be re-rendered.** Files `destroy()` lets uploads continue (the `uploads` array is module-level), but `init()` never calls `renderUploadTray()`. After a round trip the tray stays hidden with no progress and no cancel button (Files Page, low).
- **Shared globals with several owners.** Modal, mobile sidebar and router each set `document.body.style.overflow` on their own, so closing one can unlock scroll under another (Frontend Core, low).
- **Stale page HTML.** The HTML cache never invalidates, so a tab left open across a deploy swaps in old markup (Frontend Core, low).
- **Inconsistent chrome loading.** `index.html` does not load `notifications.js`, unlike the other routed pages (Feature Pages).

## How to apply it in new code

1. Expose `init`, `destroy` and optionally `beforeLeave`, and register the page in `PAGES` / `MODULES` in `router.js`. Load `router.js` after `sidebar.js`.
2. In `init()`, rebuild state from a factory. Do not rely on values left over from a previous visit.
3. Add every `window` / `document` listener through a tracking helper (`listen` / `listenGlobal`), and store every timer id. `destroy()` removes them all and removes injected nodes and body classes.
4. Bind topbar and shared-overlay controls by delegation in shared code, with a double-bind guard. Never bind them in `init()`.
5. Capture `const id = ++requestId` before each `await` and return early if it changed. For work that starts *after* an `await` (polls, timers), also check an `alive` flag that `destroy()` clears.
6. Any promise-returning UI (dialogs) must settle when teardown closes it.
