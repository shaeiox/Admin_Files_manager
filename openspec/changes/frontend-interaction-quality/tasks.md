# Tasks

Four slices, matching the Migration Plan in `design.md`. Each slice is independently revertible and leaves `npm test` green. **Slices 1 and 2 must merge before `files-page-correctness`, `upload-pipeline-correctness` and `settings-page-correctness`** (see 5.4).

## 1. Dialog focus management

Closes `specs/dialog-focus-management/spec.md`. Slice 1 - highest severity, smallest diff, one file.

- [x] 1.1 In `public/assets/js/app.js`, record the element holding focus in `Modal.open()` and restore it in `Modal.close()`, and restore it again in the `confirm()` / `prompt()` `finish()` paths after the node is removed. Verify: a test in `test/frontend/app.test.js` opens and closes each dialog form and asserts focus lands back on the trigger element, not on `document.body`
- [x] 1.2 In the same module, add a Tab / Shift+Tab cycle over the dialog's focusable controls, and make focus fall to the dialog itself when it contains none. Verify: `test/frontend/app.test.js` asserts Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last, and that a dialog with no focusable control still retains focus
- [x] 1.3 Add an Escape handler scoped to the topmost open dialog, and verify `test/frontend/app.test.js` covers all three cases: Escape closes one open dialog, Escape with two open closes only the topmost, and Escape with none open changes nothing
- [x] 1.4 Give `confirm()` and `prompt()` `aria-labelledby` / `aria-describedby` pointing at ids on the title and body nodes they already render; emit no description element when there is no body text. Verify: `test/frontend/app.test.js` asserts a non-empty accessible name in both forms, and that a bodyless dialog declares no description
- [x] 1.5 Route `title`, `message`, `hint`, `label`, `value` and `placeholder` in `confirm()` / `prompt()` through the existing `escapeHtml` helper. Verify: `test/integration/escaping.test.js` gains a case opening each dialog with a value containing `"`, `<` and `&`, asserting the characters render literally and no element is created from them
- [x] 1.6 Add `scrollbar-gutter: stable` to the root element in `public/assets/css/base.css`, keeping the existing `overflow: hidden` on open. Verify: `test/frontend/app.test.js` asserts the declaration is present, and a browser check confirms no horizontal shift when a dialog opens and closes on a page with a visible scrollbar

## 2. Contrast and hit areas

Closes `specs/color-contrast/spec.md` and `specs/control-hit-areas/spec.md`. Slice 2 - visible change, low risk, token-level with a wide blast radius.

- [x] 2.1 Write a contrast measurement helper that parses the declared colour values from both theme blocks of `public/assets/css/themes.css` and computes the WCAG ratio for each semantic text pairing, and verify it reports a known-pass pair and a known-fail pair
- [x] 2.2 Correct `--text-tertiary` in all four theme blocks so it clears 4.5:1 against the primary background in **both** themes, choosing the candidate with the largest remaining separation from `--text-secondary`. Verify: the helper from 2.1 reports it passing in both themes, and the hierarchy assertion below still passes
- [x] 2.3 Update the now-superseded comment at `public/assets/css/layout.css:450-454` so it records the corrected token rather than warning against it, and verify the file no longer tells a future contributor to route around `--text-tertiary`
- [x] 2.4 Add a light-theme selection highlight in `public/assets/css/base.css` so selected text clears 4.5:1 against its highlight in both themes and remains visibly distinct from unselected text. Verify: the helper from 2.1 reports both selection pairings passing, and a browser check confirms light-theme selection is readable
- [x] 2.5 Darken the light-theme `--text-link` and `--text-link-hover` so both clear 4.5:1 on the page background. Verify: the helper from 2.1 reports both link states passing in the light theme
- [x] 2.6 Extend the helper to assert the accent's ratio wherever it is used as text or as a background carrying text, and report the pair against its applicable minimum. Verify: the accent check runs and reports a pass for the current pairings
- [x] 2.7 Add an assertion that no text token is indistinguishable from the primary text token, so the contrast fix cannot be satisfied by flattening the hierarchy. Verify: the assertion passes against the corrected values and fails if tertiary is set equal to primary
- [x] 2.8 Raise every button to a 44x44 CSS pixel interactive area in `public/assets/css/components.css`, meeting it with transparent padding and negative margin so the visible box, icon size and surrounding layout are unchanged. Verify: `test/frontend/app.test.js` renders each button variant and asserts the measured interactive area, counting transparent expansion
- [x] 2.9 Do the same for icon-only buttons in the topbar and in list rows, asserting the topbar does not exceed its maximum height and that row heights are unchanged. Verify: `test/frontend/app.test.js` covers the topbar icon buttons and `test/frontend/files.test.js` covers a row-level action button
- [x] 2.10 Assert adjacent controls' hit areas do not intersect. Verify: `test/frontend/app.test.js` measures neighbouring topbar controls and neighbouring row actions and reports no intersection

## 3. Motion policy

Closes `specs/frontend-motion/spec.md`. Slice 3 - largest diff, least severe, needs a browser pass. Commit 3.1-3.4 separately from 3.5 so the property-naming fix can be reverted alone.

- [x] 3.1 Enumerate every `animation:` declaration in `public/assets/css/*.css` whose iteration count is infinite, and write a test that fails while any of them is not neutralised by a `prefers-reduced-motion: reduce` block. Verify: the test fails against the current stylesheets, listing `.animate-pulse`, `.animate-spin`, the skeleton shimmer, `.spinner`, dashboard `livePulse`, the upload queue shimmer, the dropzone hairline, the file-card pulse and the settings live dot
- [x] 3.2 Consolidate the five existing per-file reduced-motion blocks into one declaration list in `public/assets/css/base.css` and add the coverage 3.1 enumerates. Verify: the test from 3.1 passes, and each of the five previously-covered selectors is still neutralised
- [x] 3.3 Assert that under reduced motion every one-shot entrance animation resolves to its visible end state, and that a determinate progress bar remains readable without movement and distinguishable from an indeterminate one. Verify: `test/frontend/dashboard.test.js` and `test/frontend/uploads.test.js` cover the panel entrance and the progress bar respectively
- [x] 3.4 Add press feedback by transform or opacity to `.btn`, `.btn-icon` and `.dropdown-item`, applied instantly under reduced motion. Verify: `test/frontend/app.test.js` asserts a press produces a visible state change, that the change is transform- or opacity-based rather than size-based, and that it carries no transition under reduced motion
- [x] 3.5 Replace every `transition: all` with a named property list, starting with the three `.transition-*` utilities in `public/assets/css/base.css`, then the declarations in `components.css` and `dashboard.css`. Verify: a test asserts no stylesheet uses the `all` keyword, and `npm test` is green so no control has lost a transition it relied on
- [x] 3.6 Rewrite the sidebar collapse as a single `transform` on the content wrapper instead of transitioning `width` and `margin-left`. Verify: a test asserts no transition names a layout property, and a browser check confirms collapse still looks and behaves identically
- [x] 3.7 Rewrite the dashboard chart bars and their entrance keyframe as a bottom-anchored `scaleY`. Verify: `test/frontend/dashboard.test.js` asserts the bar advance uses a transform, and a browser check confirms the chart still renders identically
- [x] 3.8 Drive the upload progress fill from a single shared sub-second cadence using a composited `transform: scaleX`, keeping the tick as the sole source of the value, and assert no timer is created per queue item. Verify: `test/frontend/uploads.test.js` asserts one shared cadence exists, that no per-item timer is registered, and that the rendered bar does not stall between value updates
- [x] 3.9 Move removal of the navigating indicator to after the new page's content is swapped in, replace the universal `html.is-navigating *` selector with inheriting-element selectors, and reset scroll position without animating. Verify: `test/frontend/navigation.test.js` asserts the indicator is still present while navigation is in flight and absent once content lands, that the universal selector is gone, and that scroll position is set without animation
- [x] 3.10 Add a short entrance transition to arriving page content, and assert the transition resolves to visible content rather than leaving it transparent. Verify: `test/frontend/navigation.test.js` covers the arriving-content signal and the reduced-motion path
- [x] 3.11 Add an open delay to `[data-tip]::after` that does not apply to keyboard focus, and assert no `data-tip-pos` value changed. Verify: `test/frontend/tooltips.test.js` passes **unchanged**, and a new case asserts the delay exists and is bypassed on focus

## 4. Tokens and typography

Closes `specs/design-tokens/spec.md`. Slice 4 - most visible, easiest to revert wholesale.

- [x] 4.1 Confirm `--color-ink-black` and `--gradient-hero-horizon` are referenced nowhere; if either is referenced, repoint it to a palette colour instead of deleting it. Verify: a grep over `public/` reports zero references for each, or the task records the repoint
- [x] 4.2 Delete the unreferenced tokens, keeping `--gradient-dusk-violet`. Verify: a test asserts the token file declares no pure-black value and that every gradient stop is a palette colour
- [x] 4.3 Assert the accent is used for interactive state, focus and emphasis rather than as a primary-action fill. Verify: a test asserts `.btn-primary` does not fill with the accent
- [x] 4.4 Verify DM Sans and Inter are SIL Open Font License, and fetch the OFL notice alongside the files. Verify: an OFL text file exists in the font directory and names both families
- [x] 4.5 Download the Latin `woff2` subsets for both families into `public/assets/fonts/`, declare `@font-face` with `font-display: swap` and a fallback size adjustment, and delete the two `@import` lines from `public/assets/css/tokens.css`. Verify: a test asserts no stylesheet issues a third-party font request, that no `@import` of a remote stylesheet remains, and a browser check confirms text renders with no console font errors
- [x] 4.6 Correct the `--font-geist` token so it declares the family it is named for, and collapse the duplicated font-family tokens so each remaining one is either used or documented as reserved. Verify: a test parses the font-family tokens and asserts each resolves to its named family and that no two declare an identical stack under different names
- [x] 4.7 Collapse the thirteen corner-radius values to five documented steps, deleting the unused steps, merging the two that differ only marginally, and recording in the token file which components use which step. Verify: a test asserts every declared radius resolves to a scale token and that no component hardcodes a radius
- [x] 4.8 Replace the hardcoded `16px` in `public/assets/css/login.css` with a scale token. Verify: a browser check confirms the login card still reads correctly **in both themes**, and the reviewer is shown the before and after radius explicitly, since this step changes a rendered value
- [x] 4.9 Replace the duplicated exit-duration literal in `public/assets/js/app.js` with a read of the shared duration token, so a token change cannot desynchronise behaviour from presentation. Verify: `test/frontend/app.test.js` asserts the behaviour wait resolves to the token's value and that no element is removed before its animation ends
- [x] 4.10 Record the new token contract in `docs/REPO_MAP.md` (typography source, radius scale, and the reduced-motion policy) and in `docs/CONTRACTS.md` where it affects a page contract. Verify: the documentation names the self-hosted font path, the five radius steps with their component mapping, and states that reduced motion is honoured globally

## 5. Integration and cross-change checks

- [x] 5.1 Run the full suite and confirm it is green with no changes to test counts that were not added by this change. Verify: `npm test` exits 0
- [x] 5.2 Assert the shared dialog layer and the Files drawer compose without either redefining the other: a dialog opened above the drawer owns focus, and closing it moves focus into the drawer. Verify: `test/frontend/files.test.js` covers the composition, and `test/frontend/navigation.test.js` confirms Escape scoping still holds for both layers
- [x] 5.3 Browser pass in both themes at the desktop width and at the mobile breakpoint, covering: dialog open and close with no layout shift, selection legibility, icon-button hit areas, reduced motion with the OS preference on, page navigation, and the upload progress bar under load. Verify: the pass is recorded against the spec scenarios, and any visual regression found is reverted to the owning slice
- [ ] 5.4 Rebase onto `files-page-correctness`, `upload-pipeline-correctness` and `settings-page-correctness` once they land, and re-check the dialog composition and the shared reduced-motion policy against whatever those changes introduced. Verify: `npm test` is green after the rebase, and `test/frontend/tooltips.test.js` and `test/frontend/files.test.js` still pass unmodified

## Workflow follow-up

- Archive the change once slices 1 through 5 are merged and the browser pass in 5.3 is recorded.
- After archiving, confirm the five capability specs landed under `openspec/specs/` and that `docs/REPO_MAP.md` and `docs/CONTRACTS.md` match the shipped behaviour.
## Implementation notes (2026-10-16)

- Tests live in dedicated files rather than the ones the tasks name: `contrast.test.js` (+ `test/helpers/contrast.js`), `hit-areas.test.js`, `motion.test.js`, `tokens.test.js`, `dialog-drawer.test.js`; `uploads.test.js` covers the cadence (3.8).
- 3.7: the dashboard chart bars no longer exist (removed earlier; `live-server.test.js` pins their absence). Their dead CSS, the sparkline and the settings quota bar were deleted instead of converted.
- 4.4/4.5: italic was not shipped - nothing in the UI sets it. CSP tightened to `font-src 'self'` and Google preconnects removed from all six shells.
- 4.7/4.8: five steps sm 6 / md 10 / lg 16 / xl 24 / pill. Visible changes: `--radius-md` 8 -> 10px, xs/4px marks -> 6px, the three 40px large panels -> 24px. The login card is 16px before and after.
- Found in the browser pass and fixed: Escape on `Modal.confirm/prompt` closed the dialog but never settled its promise (now `open(..., { onDismiss })`); the sidebar `clip-path` reveal snapped (`inset()` -> `none` is not interpolable); the topbar `.theme-toggle` had no CSS (12x24 hit area, both icons visible).
- Owner decision after the browser pass (2026-10-16): the sidebar collapse is a layout animation after all - `.sidebar` width and `.main-area` margin-left on one curve - superseding 3.6's transform rewrite. Every transform-only version left the page laid out at its final width, so content slid and then snapped (or overflowed/left a gap); the owner chose true reflow. The exception is scoped to the sidebar's own rules in layout.css (`RESIZE_EXCEPTION` in motion.test.js); the cost is a relayout per frame for 640ms, which a very large file table may feel. The stat-card grid still changes column count once mid-motion (grids cannot interpolate columns).
- 5.3 not covered: the OS reduced-motion preference could not be emulated in the pane (verified from CSS only). `.dropdown-item`, `.filter-chip`, `.breadcrumb-item` and `.tree-caret` stay under 44px on touch; expanding stacked menu items or tree carets would make neighbouring hit areas intersect (2.10).
