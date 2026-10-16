# Design

## Context

The shared client layer is a set of plain IIFE modules attached to `window`, loaded by `<script>` tags in dependency order, with no build step (`AGENTS.md` rule 8). There is no bundler, no framework, no CSS preprocessor, and no test runner dependency. Anything added here must work as authored CSS and ES2020 JavaScript served from `public/assets/`.

Three properties of the existing code shape the approach:

1. **`Modal` is already a singleton with one call surface.** `confirm()` and `prompt()` both build a backdrop, append it, and delegate to `open()` / `close()`. Every caller goes through those two functions. A focus trap, an Escape handler and a focus-restore mechanism are therefore each a change to *one* place, not a change to every call site. This is the cheapest high-severity fix in the change.

2. **There is no shared motion layer to extend.** Animation is declared per-stylesheet. `base.css` defines the keyframes and seven `.animate-*` utility classes; each page stylesheet then declares its own `animation:` / `transition:` against those keyframes. The five existing `prefers-reduced-motion` blocks are hand-written per-file, which is why coverage is partial.

3. **Contrast is a token problem, not a stylesheet problem.** All four theme blocks in `themes.css` redefine the same semantic tokens. `--text-tertiary` is consumed 94 times but declared once per theme, so the fix is four value changes, not 94 edits. The measured blast radius is on the *rendered result*, not on the diff.

The in-flight changes `files-page-correctness`, `upload-pipeline-correctness` and `settings-page-correctness` all touch page-owned markup in `files.css`, `uploads.css`, `settings.css` and `components.css`. This change touches the same files. Ordering between the two sets is a real constraint, covered in Migration Plan.

## Goals / Non-Goals

**Goals:**

- Every fix lands in shared code where the fix is shared. Contrast, hit area and duration fixes touch tokens once; the dialog fixes touch `Modal`'s two functions once; the reduced-motion fix is one declaration list rather than ten per-file blocks.
- Each fix is verifiable by a test that would actually fail today. The specs name the failure; `tasks.md` names the assertion.
- Motion that is added is motion that answers a question: *did my click register?* *is the page still loading?* *is this bar moving?* Nothing is added for decoration.
- Each change is independently revertible, so a failed fix can be backed out without unwinding the rest.

**Non-Goals:**

- No visual redesign. The violet accent, the monochrome inverted-surface primary button, the dark-glass hero and the ten-file CSS architecture all stay. This change makes the existing language correct, not different.
- No JS animation library, no CSS framework, no icon library. `IntersectionObserver` and `requestAnimationFrame`, both already used in `dashboard.js`, cover every case here.
- No new endpoint, service, schema or API shape.
- No change to tooltip *placement*. That belongs to `tooltip-placement` and is pinned by `test/frontend/tooltips.test.js`; only the open delay is in scope.
- No fix to the Files drawer focus model, which belongs to `files-accessibility`.
- Not a full a11y conformance claim. This change fixes the baseline defects an audit found. It does not audit and fix things the audit did not reach.

## Decisions

### 1. Fix `--text-tertiary` at the token, not at the 94 call sites

**Chosen:** change the value in all four theme blocks of `themes.css`.

**Alternative:** re-point the 94 consumers at `--text-secondary`. Rejected: it is a 94-line diff across nine stylesheets, it makes the de-emphasis hierarchy uniform (so metadata loses its rank), and it reintroduces the problem the moment anyone uses `--text-tertiary` again.

**Consequence to accept:** the corrected tertiary tone will sit closer to `--text-secondary` than it does today, narrowing the visual hierarchy between primary, secondary and tertiary text. This is a real trade: AA at 12-13px and a wide three-step hierarchy are not both available from a neutral ramp at this size. The value chosen in `tasks.md` is the one that clears AA in *both* themes with the largest remaining separation from `--text-secondary`, rather than the one that passes the light theme and marginally misses the dark. `layout.css:450-454`'s existing comment records that a previous author reached for the conservative fix; this change supersedes it and the comment should be updated to say so rather than left to contradict the new value.

### 2. Trap focus inside `Modal`, not in a new global focus manager

**Chosen:** the trap, the Escape handler and the focus-restore live inside the existing `Modal` closure, next to `open()` and `close()`.

**Alternative:** a document-level focus manager that also governs the Files drawer. Rejected: it would collide with `files-accessibility`, which already specifies drawer focus containment, Escape scoping and focus restore. Two implementations of "the topmost layer owns focus" is how those requirements drift apart. The dialog owns the dialog; the drawer owns the drawer; they compose because both are `is-open` layers, and composition is asserted in the regression task rather than reimplemented here.

**Escaping** is done by routing `confirm()` and `prompt()` through the existing `escapeHtml` helper rather than introducing a templating layer. The values are text-only by construction once escaped; no caller needs to emit markup through a dialog, so nothing is lost.

**Accessible naming** uses `aria-labelledby` / `aria-describedby` pointing at ids the module assigns to the title and body nodes it already creates. This is preferable to `aria-label` because the visible text is reused, so the accessible name matches what a sighted user reads.

### 3. Reserve the scrollbar instead of hiding it

**Chosen:** `scrollbar-gutter: stable` on the root element, so the scrollbar's space is always reserved.

**Alternative:** keep `overflow: hidden` and compensate with padding equal to the measured scrollbar width. Rejected: it requires measuring on every open, it fights the custom 6px scrollbar already styled in `base.css:41-57`, and it is fragile in full-screen and overlay-scrollbar modes.

`overflow: hidden` stays in place on open so the page behind still cannot scroll. The requirement is that the prevention no longer *depends* on removing the scrollbar, which `scrollbar-gutter` makes true.

### 4. One reduced-motion declaration list in `base.css`, not ten per-file blocks

**Chosen:** a single rule set in `base.css` that neutralises every animation and transition in one place, keyed on `@media (prefers-reduced-motion: reduce)`.

**Alternative:** keep the per-file pattern and extend it. Rejected: the existing five blocks are hand-maintained, which is exactly why six infinite loops are uncovered. A new animation added next year would again be opt-in to nothing.

**Implementation shape:** the rule set targets the animation and transition declarations themselves, and the reduced-motion tests are written as an *existence* assertion over the stylesheets (every `animation:` with an infinite iteration count must be neutralised by the reduce block) rather than by simulating the media query at runtime. A runtime media-query simulation in `node:test` would test the test environment, not the stylesheet.

**Where the existing five blocks go:** they are folded into the single list. Leaving them would mean two sources of truth for one policy.

### 5. Animate transform and opacity; name every transitioned property

**Chosen:** replace each `transition: all` with a named list, and rewrite the nine layout-property transitions as transforms.

**Alternative:** keep the layout properties and accept the cost. Rejected for two of the three, specifically:

- **Sidebar collapse** transitions `width` on the sidebar *and* `margin-left` on the content (`layout.css:53,713`). Both are layout. Collapsing the sidebar therefore relayouts the document for 300ms. One `translateX` on a content wrapper driven by a class replaces both, with identical visual result.
- **Dashboard bars** transition `height` (`dashboard.css:426,540`). A bottom-anchored `scaleY` is the same picture and stays on the compositor. The `growBar` keyframe becomes the same transform.
- **Upload progress** transitions `width` (`uploads.css:516`). This one is also a correctness fix, not only a compositing one; see decision 6.

`.transition-fast`, `.transition-base` and `.transition-slow` (`base.css:384-386`) all mean `all` today, so they are the highest-leverage edit: fixing the three utilities fixes every future use. They are redefined to name `opacity`, `background-color`, `border-color`, `color` and `transform`, which is the union of what current callers actually transition.

### 6. Fix the upload progress cadence rather than the transition

**Chosen:** make the rendered bar continuous.

The observed defect is arithmetic, not aesthetic: the ticker runs at 1000ms and the transition runs at 300ms, so the bar moves for 300ms and is frozen for 700ms. Two fixes were considered:

- **Match the transition to the tick** (drop the transition, jump once per second). Rejected: it removes all smoothness and makes a large jump every second, which reads worse.
- **Drive the fill from a composited `transform: scaleX` at a sub-second cadence**, with the tick remaining the source of truth for the value. Chosen. The bar then interpolates continuously at the compositor while the percentage still comes only from the server-reported value, so no value is invented.

**Constraint carried from `upload-pipeline-correctness`:** `upload-queue-integrity` requires that rendering cost does not scale with queue size per update. The chosen approach must not introduce one timer per queue item. One shared cadence driving all rows satisfies both.

### 7. Signal the page change in the router, and hold the progress indicator until the content lands

**Chosen:** a short entrance transition on the arriving content, and move removal of the navigating indicator to after the new page's content is in place.

The current defect is ordering: the indicator is cleared in `finally` at `router.js:222`, which runs before the swap at `:226`. Moving it is a one-line relocation plus a cleanup on the success path.

**The universal selector** `html.is-navigating *` (`components.css:1455-1456`) is replaced with `html.is-navigating, html.is-navigating body { cursor: progress }`. The descendant form forces a style recalculation on every node in a file table that may hold hundreds of rows; the property is inherited, so naming the two inheriting elements is sufficient and equivalent.

**Scroll:** `settleScroll` uses `window.scrollTo(0, 0)`, which animates because `html { scroll-behavior: smooth }` is global (`base.css:19`). The fix is to scope the smooth behaviour to programmatic anchor navigation and reset scroll position without it, rather than removing `scroll-behavior` outright (which would degrade in-page anchor links elsewhere).

**Alternative considered:** a full transition choreography with a pinned or sliding shell. Rejected: this is a tool an operator uses all day; a page transition that plays on every navigation becomes the thing they wait for.

### 8. Press feedback by transform, with no transition under reduced motion

**Chosen:** a `scale` or `translateY` on `:active` for buttons, icon buttons and menu items.

**Alternative:** a background-colour change on press. Rejected as the sole effect: it is invisible on controls that are already tinted, and on ghost buttons over the dark-glass topbar it does not read as a press at all. A colour change is kept *in addition* where the control has no tint, so the two are not competing.

The press transition is itself a transition, so it falls under the reduced-motion policy and is applied instantly rather than not at all. The requirement is that the press remains *visible* under reduced motion, which is why the spec forbids suppressing the state change itself.

### 9. Self-host the fonts as `woff2` files under `public/assets/fonts/`

**Chosen:** download the two families' `woff2` subsets, serve them from the application's own origin, declare `@font-face` with `font-display: swap`, and delete the `@import` lines.

**Alternative:** keep the CDN and add a preload. Rejected: it keeps the third-party request that this change exists to remove, and it does not help the airgapped host where the fonts silently fall back and the layout shifts.

**Licensing:** DM Sans and Inter are both SIL Open Font License, so self-hosting is permitted. The OFL notice travels with the font files. This is verified in the first task rather than assumed, because shipping an OFL font without its licence file is a compliance defect.

**Subsetting:** the interface uses Latin only. Latin subsets are taken; the `ital` axis the current URL requests (`ital,opsz,wght`) is kept because the type scale already declares an italic. Whether the italic axis earns its bytes is a judgement call recorded in the task rather than blocking here.

### 10. Collapse the radius scale to five documented steps

**Chosen:** fold thirteen declared radii to five, write down which components use which, delete the unused steps.

`--radius-2xl: 19px` is used nowhere and goes. `--radius-largecards: 40px` and `--radius-panels: 42px` differ by 2px for no stated reason and merge into one. The remainder map onto a familiar scale (sharp / small / control / card / pill) with the mapping documented in the token file itself, so the next contributor picks a step rather than inventing one.

`login.css:36`'s hardcoded `16px` is replaced with a token. **This is a visual change**, unlike most of this change: the login card's radius will shift to whatever step `16px` maps to. It is called out in tasks so it is reviewed rather than discovered.

### 11. Remove the pure-black token and the rainbow gradient token

**Chosen:** delete `--color-ink-black` (`tokens.css:14`) and `--gradient-hero-horizon` (`tokens.css:33-40`), after confirming neither is referenced.

`--gradient-hero-horizon` is a five-stop orange-to-blue sweep. Its colours are not palette colours, and it is the only declaration in the token file that introduces a hue family the rest of the system avoids. `--color-dusk-violet`'s own gradient (`tokens.css:25-32`) stays: it is a single-hue, alpha-masked accent wash, which is a different thing.

**If either token turns out to be referenced**, the task does not delete it; it repoints it to a palette colour. The check precedes the edit.

## Risks / Trade-offs

**[Contrast fix narrows the visual hierarchy]** → The corrected tertiary tone is closer to `--text-secondary` than today. Mitigated by picking the value with maximum remaining separation from secondary while still clearing AA in both themes, and by the measured-ratio test, which means the choice can be re-evaluated later against a stated bar rather than re-litigated.

**[`transition: all` removal touches 22 declarations and may expose one that was relying on an unnamed property]** → Mitigated by doing the three `.transition-*` utilities and the shared `components.css` declarations as the first slice and running the frontend suite between slices. A missed property shows up as a control that no longer transitions, which the existing `files.test.js` / `uploads.test.js` interaction assertions are likely to catch.

**[Self-hosted fonts change first-paint text metrics]** → `font-display: swap` shows the fallback first, so the current CDN behaviour (which also swaps) is preserved, and a fallback-adjusted size-adjust is declared to reduce the reflow. Mitigated by loading the Latin subset only and by the fonts landing early in the task order.

**[Radius collapse changes the login card's rendered radius]** → Called out as an explicit visual change in the task and reviewed by eye rather than assumed invisible.

**[Reduced-motion consolidation removes the five existing per-file blocks]** → If any of those five selectors is missed during the fold, a previously-honoured case regresses. Mitigated by converting the reduced-motion test into an existence assertion that *enumerates every infinite animation in the stylesheets* and requires each to be covered, so a miss is a failing test rather than a silent regression.

**[This change and three in-flight changes edit the same stylesheets]** → See Migration Plan. The merge order matters and is the reason this change lands first.

**[Motion added to the router makes navigation slightly slower to feel complete]** → Real trade. The transition is kept short and the progress indicator now genuinely covers the wait, so the added time is signalled rather than hidden. If it proves irritating in use, the entrance transition is the single thing to cut, and it can be removed without touching the indicator fix.

**[`control-hit-areas` raises 36px icon buttons toward 44px]** → In the topbar this competes with the 80px navigation height cap and could force a taller bar or tighter icon spacing. The spec requires the bar height not to grow, which means the hit area is likely to be met with transparent padding and a negative margin so the visual layout is unchanged. That technique is what the `control-hit-areas` spec's "transparent expansion is counted" scenario exists to permit, and it is why that scenario is there rather than left to the implementer.

## Migration Plan

This change ships in four slices, each independently revertible and each leaving the suite green.

**Slice 1 - correctness (no visual change).** Dialog focus trap, Escape, focus restore, accessible naming, escaping. Highest severity, smallest diff, touches one file. Ships first because the three in-flight page-level changes will inherit it, and because a focus trap is impossible to retrofit later without conflicting with whatever the drawer work established.

**Slice 2 - baseline (visible change, low risk).** Contrast tokens, `::selection`, link token, hit areas, `scrollbar-gutter`. Contrast and hit areas are token-level with a wide blast radius; they are isolated in their own slice so a visual regression can be reverted without losing the dialog work.

**Slice 3 - motion policy.** Reduced-motion consolidation, `transition: all` removal, layout-property rewrites. Largest diff, least severe, and the one most likely to produce a visible regression that only shows up in a real browser. Ships after slices 1 and 2 so a revert here costs nothing else.

**Slice 4 - tokens and typography.** Self-hosted fonts, radius collapse, dead-token removal, the shared duration constant. Ships last because it is the most visible and the easiest to revert wholesale.

**Ordering against the in-flight changes.** Slices 1 and 2 should merge before `files-page-correctness`, `upload-pipeline-correctness` and `settings-page-correctness` land, because all three edit `components.css` and their page-owned specs assume the current shared defaults. If they merge first, this change rebases onto them and re-checks the `Modal` composition against whatever the drawer work introduced.

**Rollback.** Each slice is a separate commit touching a disjoint set of concerns. Slice 3 is the only one with per-declaration risk, so its `transition: all` removals are committed separately from its reduced-motion work, allowing the property-naming fix to be reverted alone if a missed property surfaces in use.

**Verification at each slice.** `npm test` green; the new assertions for the slice green; `test/frontend/tooltips.test.js` and the Files/Uploads interaction suites unchanged and passing. Slice 3 and 4 additionally need a real browser pass in both themes at desktop and at the mobile breakpoint, because their defects are visual and a stylesheet assertion cannot see them.

## Open Questions

None that would change the specs, the approach, or the task breakdown.

Two items are deliberately left to the implementing task rather than resolved here, because both are reversible judgement calls with a stated fallback: the exact corrected value for `--text-tertiary` (any value clearing AA in both themes satisfies the spec, and `tasks.md` records how to pick between the candidates), and whether the italic axis of the self-hosted typefaces is worth its bytes (dropping it is a size optimisation that changes no rendered text in the current type scale).