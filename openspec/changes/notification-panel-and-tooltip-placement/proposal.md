# Proposal

## Why

Two categories of dishonest/losing UI remain on the Uploads and Settings pages:

1. **Notification surfaces that do nothing or lie.** The bell button rendered on `uploads.html:168` and `settings.html:168` has no source and no handler — clicking it is a no-op, while `index.html:175` documents the opposite stance ("No notification bell: this application has no notification source"). `settings.html:771` renders an "Add event" button with no handler and no accessible name, and `settings.html:830` hardcodes `<div class="integration-status connected">Notifications on</div>` with no integration behind it. `AGENTS.md` treats controls without working handlers and fabricated statuses as red lines.
2. **Tooltips that never appear where users need them.** `[data-tip]::after` opens *above* every control by default. Against a sticky topbar (`top: 0`) and the `top: 0` drawer, every topbar and drawer tooltip renders clipped by the viewport (Refresh, view toggles, Notifications, drawer Close). Tooltips for controls inside scroll containers — file rows (`files.css:166,597`), queue rows (`uploads.css:422`), drawer body — are clipped by their container. Edge controls can push nowrap tips off the viewport. One control was patched with `data-tip-pos="left"`; the rest are unhandled.

Why now: these are silent trust-and-usability bugs on the two least-tested pages, and the project has an explicit convention that no control renders without a working handler.

## What Changes

- **Wire the notification bell to a real source.** Add a shared dropdown panel (app-level module, used by Uploads and Settings) that renders the genuine activity feed already exposed by `GET /api/dashboard/summary` (`activities`, backed by `MetadataService.getActivities`). Loading, empty ("No recent activity"), and unavailable (request failed) states are distinct; nothing is fabricated when the feed is empty. The panel closes on Escape, outside click, and page navigation, and is keyboard-operable. The bell carries no unread badge unless a real unread signal exists — none today, so none is shown.
- **Make the topbar bell consistent across pages.** The dashboard and files pages that currently have no bell either omit it or reuse the same shared panel; the decision is recorded in `design.md`. No third variant of bell is introduced.
- **Remove the non-functional "Add event" button** from the Webhooks trigger-events list.
- **Remove the fabricated `Notifications on` connected status** from Settings → Integrations. The integration card reports its real state or states that it is not configured.
- **Fix tooltip placement for clipped contexts.** Every control whose tooltip is clipped by the viewport or a scroll container gains an explicit `data-tip-pos` variant (`bottom` for topbar/drawer-header controls, `left`/`right` where horizontal clip is the constraint), or the tooltip moves to a placement that survives the container. Row/queue action buttons get placements that survive their scroll container.
- **Bound the tooltip horizontally.** Add a `max-width` and wrapping fallback so edge controls cannot push tips off-screen.
- **Pin both categories with tests.** Source-level assertions that every icon-only button carries `aria-label`, every topbar control carries a non-default `data-tip-pos`, no bell renders without the shared handler, and no integration status is hardcoded on.

### Preserved, not changed

- The layered flow `routes → controllers → services → fs` and the `PathService` choke point. This change adds one read-only client call to an existing endpoint and adds no endpoints.
- Response-envelope conventions: `GET /api/dashboard/summary` remains a bare object; no new endpoint is added.
- Metadata semantics stay fire-and-forget and capped at 50 entries.
- `MetadataService`, `api.js` download helpers, and all page-module contracts are unchanged.
- The `[data-tip]` mechanism itself stays CSS-only (no JS tooltip engine), per the no-build constraint.

## Capabilities

### New Capabilities

- `notification-panel`: the shared bell dropdown panel on Uploads/Settings — real activity source, loading/empty/unavailable states, keyboard and Escape dismissal, outside-click close, consistent topbar presence.
- `tooltip-placement`: viewport-safe `[data-tip]` placement for topbar, drawer, scroll-container, and edge controls, plus a bounded width.

### Modified Capabilities

None.

## Impact

**New files**
- `public/assets/js/notifications.js` (shared bell panel module)
- `test/frontend/notifications.test.js`, `test/frontend/tooltips.test.js`

**Modified files**
- `public/uploads.html`, `public/settings.html`, `public/index.html`, `public/files.html` (bell wiring, remove dead controls, fabricated status)
- `public/assets/js/uploads.js`, `settings.js` (bind the shared panel via delegation)
- `public/assets/css/components.css` (`data-tip-pos` coverage, max-width)
- `public/assets/css/files.css`, `uploads.css` (scroll-container tooltip placements)
- `AGENTS.md`, `docs/CONTRACTS.md` if the bell panel becomes part of the page-module contract

**Untouched:** `src/**` (no endpoint changes), `api.js`, `MetadataService`, the `data-tip` markup contract on otherwise unaffected pages.
