# Tasks

## 1. Notification panel

- [x] 1.1 Create `public/assets/js/notifications.js` as a `window.AFM.Notifications` IIFE exposing `bindTopbarBell()` (delegated click on `[data-tip="Notifications"]` bells) and `open()/close()`; it fetches `/api/dashboard/summary`, renders loading → rows (escapeHtml on every interpolated string) → empty ("No recent activity") → unavailable (with retry) states, closes on Escape / outside click / page navigation, and moves focus to the panel on open and back to the bell on close. Verify with `test/frontend/notifications.test.js`.
- [x] 1.2 Wire `notifications.js` into `uploads.html` and `settings.html` script order (after `api.js`, before the page module) and call `AFM.Notifications.bindTopbarBell()` from `uploads.js` and `settings.js`. Verify the bell click opens the panel on both pages (manual) and the source test asserts the script tag and binding call.
- [x] 1.3 Set `aria-expanded="false"` + `aria-controls` on both bell buttons in `uploads.html`/`settings.html`, with the panel node carrying the matching `id` and `role="dialog" aria-label="Recent activity"`. Verify `test/frontend/notifications.test.js` asserts the attributes.
- [x] 1.4 Remove the hardcoded `<div class="integration-status connected"><span class="dot"></span> Notifications on</div>` in `settings.html` and the non-functional webhook trigger-events "Add event" button; replace the integration status with real text ("Not configured") and drop the dead button. Verify no source matches `integration-status connected` or `data-tip="Add event"` in settings.html.

## 2. Tooltip placement audit and fixes

- [x] 2.1 In `components.css`, add a `[data-tip][data-tip-pos="right"]` variant and a `max-width`/`overflow-wrap` fallback on `[data-tip]::after`. Verify `test/frontend/tooltips.test.js` asserts the declaration block exists.
- [x] 2.2 Set `data-tip-pos="bottom"` on every topbar control across the four pages: `index.html` refreshDashboard, `files.html` view toggles (199/202) and `btnRefresh` (225), `uploads.html` bell (168), `settings.html` bell (168). Verify `test/frontend/tooltips.test.js` asserts each id/line carries `data-tip-pos="bottom"`.
- [x] 2.3 Set `data-tip-pos="bottom"` on `files.html` `drawerClose` (289) and `data-tip-pos="left"` where the opening would clip the right edge (e.g. `bulkClear` when the bulk bar hugs the right). Verify tooltips render fully in manual check and the source test passes.
- [x] 2.4 Give scroll-container action buttons safe placements: `files.js:579/580` (list rows) and `files.js:630` (grid cards — also add the missing `data-tip="More"`), `uploads.js:334` queue rows, `files.js:801` drawer copy-path — `bottom` (or `left` for right-edge columns). Verify manual hover shows a fully visible tooltip inside the scroll area and the source test asserts placement.
- [x] 2.5 Re-check `files.html:241` `btnTreeNewFolder` (already `left`) still fits; adjust to `bottom` only if the tree panel clips it horizontally. Verify manual hover.

## 3. Tests and guardrails

- [x] 3.1 Add `test/frontend/notifications.test.js`: asserts both pages load `notifications.js`, the bell carries `aria-expanded`/`aria-controls`, `AFM.Notifications` is referenced by both page modules, no fabricated status markup remains, and the "Add event" button is gone. Verify `node --test test/frontend/notifications.test.js` passes.
- [x] 3.2 Add `test/frontend/tooltips.test.js`: asserts every `data-tip` element in the audited set carries an explicit `data-tip-pos`, the grid "more" control has a `data-tip`, and `components.css` declares `max-width` on `[data-tip]::after`. Verify `node --test test/frontend/tooltips.test.js` passes.
- [x] 3.3 Run the full suite `npm test` and confirm it exits 0 with the two new files included.

## 4. Docs

- [x] 4.1 Document the shared notifications panel and the `data-tip-pos` contract in `docs/CONTRACTS.md` (page-module contract + tooltip placement rule) and `AGENTS.md` frontend rule 8/10 notes. Verify the files mention `AFM.Notifications` and `data-tip-pos`.
