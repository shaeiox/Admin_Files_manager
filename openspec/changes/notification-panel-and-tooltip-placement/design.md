# Design

## Context

See proposal.md for motivation. The relevant substrate: a neon-authenticated Express 5 API, a no-build vanilla JS frontend (`window.AFM` modules, IIFE, `<script>` load order), and four near-identical topbars. Tooltips are pure CSS via `[data-tip]`/`::after`; the only escape hatch is `data-tip-pos="left|bottom"`. Activity data already exists at `GET /api/dashboard/summary` (`activities`, `MetadataService.getActivities`, capped at 50, 10 used on the dashboard).

## Goals / Non-Goals

**Goals:**
- Every topbar/drawer/scroll-container tooltip is fully visible in its real context.
- One shared, tested notification panel wired to the bell, on the pages that render a bell.
- No fabricated notification state anywhere on the four pages.
- Source-level tests pin the placement and aria contracts so they cannot regress silently.

**Non-Goals:**
- A JS tooltip engine, portal-based tooltips, or a full component system.
- A notifications API, push, unread tracking, or per-user read state.
- Changes to toast semantics or the `Toast` lifecycle.
- Restyling the topbar or the drawer.

## Decisions

**D1 — Keep the tooltip CSS-only; add a `right` variant and flip per-context.**
Alternatives: (a) JS-positioned tooltip appended to `body` — solves all clipping but introduces a focus/scroll tracking layer the no-build frontend deliberately avoids, and breaks the CSS-only contract other pages rely on; (b) `overflow: visible` on the scroll containers — breaks the table/queue layout. Chosen: extend the CSS variants (`right` added for right-edge controls in RTL-free rows) and set `data-tip-pos` per control from an audit of each clipping context. Row/queue buttons use `bottom` (inside the scroll area they obscure the row briefly, acceptable since the tooltip is transient), or `left` where the row is full-width. The drawer-close button uses `bottom`.

**D2 — Tooltips that must escape a scroll container use a `data-tip-pos` that points inward.**
For `files-table-wrap`, `#queueList`, and `.drawer-body`, `bottom` keeps the tip inside the scrollport width and merely overlaps the container's own content — visible, transient, and inside the clipping box. Where `bottom` is impractical (first row), `left`/`right` variants are used. A regression test asserts each audited control carries a non-default `data-tip-pos`.

**D3 — The bell panel is a shared module, not per-page code.**
`notifications.js` (new IIFE on `window.AFM.Notifications`) owns: open/close state, outside-click + Escape handling, focus return, one fetch of `/api/dashboard/summary` per open (no polling — the data is advisory and the dashboard already polls), and rendering of loading/empty/unavailable/rows. Both bell call sites (`uploads.html`, `settings.html`) instantiate it via a shared topbar hook; `files.html`/`index.html` stay bell-less, which is recorded as deliberate: adding the bell to a page is a product decision, not a fix. The panel reuses `escapeHtml` for every interpolated string (activity labels are filesystem-derived).

**D4 — No unread badge today.**
The activity feed has no read/unread distinction; adding one would require a store. The bell renders plain until a real signal exists.

**D5 — Remove, don't stub, the dead Webhooks "Add event" control and the fabricated "Notifications on" status.**
Matches the files-page surface-honesty precedent. The webhook URL input is also non-functional; it is replaced with a hint that webhooks are not configured, or removed along with the row.

**D6 — Pin with source assertions, not browsers.**
The repo's frontend tests are vm/source-assertion based (`test/frontend/*`). New tests: `tooltips.test.js` asserts every `[data-tip]` control in the audited contexts carries an explicit `data-tip-pos` and that `components.css` declares a `max-width` on `[data-tip]::after`; `notifications.test.js` asserts the bell markup loads `notifications.js`, that the handler binds, that no hardcoded `integration-status connected` / "Add event" markup remains, and that the panel renders loading/empty/unavailable strings.

## Risks / Trade-offs

- [Risk] A CSS-only tooltip cannot flip dynamically at runtime, so a control that is clipped in one layout and fine in another gets only the safest static placement. → Mitigation: the audit table in tasks enumerates each control and its placement; ambiguous cases prefer `bottom`.
- [Risk] One fetch per panel open duplicates the dashboard's fetch when both pages are open. → Mitigation: advisory data, no caching promised; acceptable at this scale.
- [Risk] `data-tip-pos` variants must cover a third orientation added later. → Mitigation: `right` is added now; the CSS comment block documents the pattern.

## Migration Plan

No backend or schema change. Frontend-only: new script tag order (`app.js` → `api.js` → `notifications.js` → page module) on uploads/settings pages; CSS additions in `components.css`; markup edits in the two HTML files. Rollback is a revert of the change.
