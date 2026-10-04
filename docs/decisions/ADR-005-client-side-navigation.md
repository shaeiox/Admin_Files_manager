# ADR-005 — Client-Side Navigation Between the Four Pages

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Project maintainer
- **Tags:** frontend, navigation, page-lifecycle

## Context

The frontend is four plain HTML pages (Dashboard, Files, Uploads, Settings), each loading the shared
scripts and its own page module. Moving between them was a full document load: the sidebar flashed,
the shared data (`/api/health`, `/api/dashboard/summary` for the sidebar) was fetched again, and an
upload running on the Upload page was lost the moment the operator opened another tab. The request
was that tabs switch without reloading the page.

The constraints: no build step, no framework, each page must still load correctly on its own
(direct URL, refresh, bookmark), and page modules were written assuming they initialise exactly once
per document.

## Decision

Add `public/assets/js/router.js`, loaded on every page after `sidebar.js`:

1. It intercepts plain left-clicks on same-origin links to one of the four pages (not modified clicks,
   `target`/`download` links, other origins, or `/api` URLs) and handles back/forward.
2. It fetches the target page's HTML (cached for the session), loads that page's stylesheet before
   swapping (no unstyled flash), and loads any script the target references that is not loaded yet.
3. It calls the current page module's `destroy()`, replaces the children of `<main class="main-area">`
   and the page-owned overlays outside `.app-shell` (bulk bar, drawer, upload tray), updates the title,
   `data-page` and history, refreshes shared chrome (`AFM.refreshChrome`, `Theme.refresh`), calls the
   new module's `init()`, and moves focus to the page heading.
4. Anything unexpected — a failed fetch, a page it cannot parse, a module that did not register —
   falls back to a normal full page load.

Page modules gain a lifecycle: `init()` may run many times per document; `destroy()` removes every
`window`/`document` listener and timer the module added; an optional `beforeLeave()` can cancel
(Settings asks before dropping unsaved edits). The contract is in `docs/CONTRACTS.md`.

### Alternatives rejected

- **Merge the four pages into one HTML file with hidden sections.** One very large document, all
  page modules initialised at once, and every page's DOM ids live together (several collide in
  intent). Loses the property that each page loads on its own.
- **A hash router (`#/files`).** Breaks every existing URL (`files.html?view=starred`,
  `index.html#serverHealth`) and the fragment links inside pages.
- **A framework router.** Requires a build step, which the project rules out.
- **Leave full reloads.** The reported problem; it also cancels in-flight uploads on navigation.

## Consequences

- Navigation keeps the sidebar and shared data in place; uploads continue in the background and the
  queue is shown again on return to the Upload page.
- A page module that adds a global listener without removing it in `destroy()` now leaks across
  navigations. AGENTS.md rule 8 records this, and `test/frontend/navigation.test.js` asserts that
  every page module exposes `init` and `destroy`.
- `beforeunload` no longer fires between pages; a module that needs to guard unsaved work must use
  `beforeLeave()`.
- A new page must be added to `PAGES`/`MODULES` in `router.js`; until then links to it simply load in
  full, which is safe.
