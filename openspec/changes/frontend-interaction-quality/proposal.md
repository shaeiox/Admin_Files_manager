# Proposal

## Why

An audit of the shared client layer (`public/assets/js/app.js`, `router.js`, `theme.js`, and the ten stylesheets in `public/assets/css/`) against the project's own red lines and WCAG 2.1 AA found **six reproducible defects** and a set of baseline gaps that no existing spec covers. The defects are invisible in code review and obvious in a browser: every dialog leaks focus, every dialog shifts the layout, one contrast token is below AA in both themes and is consumed 94 times, and the interface gives almost no feedback when a user acts.

Three of these are already documented *in the codebase* as known problems that were never fixed at the source:

- `public/assets/css/layout.css:450-454` carries a comment explaining that `--text-tertiary` "falls under WCAG AA's 4.5:1 body-text contrast minimum", and fixes **one** call site (`.storage-pct`). The other 94 consumers were left failing.
- `public/assets/css/admin.css:227,493,709`, `files.css:702` and `layout.css:506` add `prefers-reduced-motion` blocks covering exactly five selectors, while six *infinite* animations run unguarded (enumerated in `design.md`).
- `AGENTS.md` rule 10 states that "`Modal.prompt` / `Modal.confirm` insert their `title`, `message` and `value` as raw HTML — escape what you pass them." `app.js:541-543` does not.

Why now: three in-flight changes are hardening the Files, Uploads and Settings pages (`files-page-correctness`, `upload-pipeline-correctness`, `settings-page-correctness`). All three fix page-owned markup. None touches the **shared** layer every page depends on, so the same dialog, the same toast region, the same tokens and the same motion defaults will still be wrong after all three land. Fixing the shared layer first means those changes inherit the corrected behaviour instead of carrying duplicates.

## What Changes

**Dialogs — the highest-severity group.**

- **Trap focus inside every dialog.** `Modal.open()` (`app.js:449-457`) moves focus in once and stops. There is no Tab loop, no `Shift+Tab` loop, and nothing returns focus to the trigger on close. `Dropdown` (`:604`) and `ContextMenu` (`:636`) both bind Escape; `Modal` binds neither Escape nor Tab. A keyboard user who opens "Delete folder" can Tab straight out of an `aria-modal="true"` dialog into the page behind it.
- **Close dialogs with Escape**, scoped to the topmost layer only, and restore focus to the element that opened the dialog.
- **Escape caller-supplied strings in the programmatic dialogs.** `Modal.confirm` interpolates `title` and `message` raw (`app.js:493-494`); `Modal.prompt` interpolates `label`, `value` and `placeholder` raw (`:541-543`). A folder named `Q3 "final" assets` currently produces a visibly broken rename dialog; a name containing `<` renders as markup. This is the shared-module instance of the gap the three page-level escaping capabilities already cover for page modules.
- **Associate each dialog with its own title and body** via `aria-labelledby` / `aria-describedby`. Both dialogs currently emit `role="dialog" aria-modal="true"` with no accessible name.
- **Stop the layout shift on open.** `open()` and `close()` set `document.body.style.overflow = 'hidden'` and restore it (`:453`, `:465`). No `scrollbar-gutter: stable` exists anywhere in the CSS, so every dialog removes the page scrollbar and shifts the document horizontally, then shifts back on close. The project has no CLS budget written down, but this is a guaranteed layout shift on the single most-used surface in the app.

**Contrast — a baseline nobody owns.**

- **Raise `--text-tertiary` to clear WCAG AA in both themes.** It is `#686868` on `#0a0a0a` (**3.55:1**) in dark and `#a3a3a3` on `#fafafa` (**2.42:1**) in light (`themes.css:31,110,188,265`). At 12-13px it carries table column headers (`base.css:221`), every input placeholder (`base.css:185`), form helper text (`components.css:320`), and file size / date / count metadata across every page. 94 declarations consume it.
- **Give `::selection` a light-theme variant.** `base.css:203-206` defines it once as `rgba(107,98,242,0.3)` over `#ffffff` text with no theme override. In light mode that is white on roughly `#d8d5f8`, about **1.4:1** — selected text is effectively invisible.
- **Darken `--text-link` in the light theme.** `#6b62f2` on `#fafafa` is **4.32:1** (`themes.css:192`), below the 4.5:1 body-text minimum.

**Hit areas.**

- **Give every interactive control a minimum hit area.** `.btn-icon` is `36x36` (`components.css:141-144`), `.btn-sm` computes to roughly 28px tall (`:121-124`), `.btn` to roughly 43px (`:10-22`). No button declares `min-height`. The app ships `viewport-fit=cover` and collapses the Files page to a card grid below 768px, so on touch every icon action is undersized.

**Motion.**

- **Honour `prefers-reduced-motion` across the shared stylesheets.** Six infinite animations run with no opt-out: `.animate-pulse` and `.animate-spin` (`base.css:480-481`), skeleton shimmer (`components.css:1102`), `.spinner` (`components.css:1119`), dashboard `livePulse` (`dashboard.css:988`), upload queue-item shimmer (`uploads.css:527`, one per active upload), the dropzone hairline (`uploads.css:83`, a 4-second loop that runs unconditionally and forever), file-card pulse (`files.css:992,1134`) and the settings live dot (`settings.css:682`). A user who has asked their OS for reduced motion gets perpetual pulsing rings and shimmering bars.
- **Give user actions feedback.** `:active` tactile feedback exists on exactly one control (`.policy-mode`, `admin.css`). Every other button click is visually inert.
- **Transition between pages.** `router.js` swaps `<main>` instantly. Its only navigation affordance is `cursor: progress`, applied by `html.is-navigating * { }` (`components.css:1455-1456`) — a universal selector that forces a style recalculation on every node in a file table, and the class is removed in `finally` at `router.js:222`, *before* the swap at `:226`, so the cursor flicks back before content changes.
- **Stop animating the wrong properties.** 22 declarations use `transition: all` (`components.css` x12, `dashboard.css` x5, and the three `.transition-*` utilities at `base.css:384-386`), and 9 animate layout properties outright — `width` and `margin-left` on sidebar collapse (`layout.css:53,713`), `height` on dashboard chart bars (`dashboard.css:426,540`).
- **Make the upload progress bar continuous.** `.qi-fill` transitions `width` over 300ms (`uploads.css:516`) but the ticker runs at 1000ms (`uploads.js:797`). The bar advances once per second and then freezes for 700ms — the most-watched element on the Uploads page reads as broken.
- **Stop animating layout on navigation.** `html { scroll-behavior: smooth }` (`base.css:19`) is global, and `router.js:168` calls `window.scrollTo(0, 0)`. Navigating from a scrolled Files page animates the viewport upward over ~300ms while the next page renders, then `focusHeading()` (`:240`) runs on top of it.

**Tokens and typography.**

- **Self-host the fonts.** `tokens.css:6-7` loads DM Sans and Inter from `fonts.googleapis.com` via `@import` inside a stylesheet — render-blocking and serialized after the parent sheet parses. This is a self-hosted deployment behind `helmet`, and two third-party requests per page load contradict that premise; on an airgapped host the fonts silently fall back and the layout shifts.
- **Fix the `--font-geist` naming lie.** The token is declared as `'Inter'` (`tokens.css:50`).
- **Collapse the radius scale.** Thirteen values are defined (`tokens.css:107-117`), including `--radius-2xl: 19px` (used nowhere) and `--radius-largecards: 40px` / `--radius-panels: 42px`, which differ by 2px with no stated rule. `login.css:36` hardcodes `16px` instead of using a token.
- **Remove `--color-ink-black: #000000`** (`tokens.css:14`) and the five-stop rainbow `--gradient-hero-horizon` (`tokens.css:33-40`).

### Preserved, not changed

- The **Files drawer** focus trap, Escape scoping, `aria-hidden` sync and roles. `files-page-correctness` → `files-accessibility` already owns them. This change fixes the shared `Modal` only; the two must compose without either redefining the other.
- **Tooltip placement and bounding.** `notification-panel-and-tooltip-placement` → `tooltip-placement` owns it and `test/frontend/tooltips.test.js` pins it. The only tooltip change here is an *open delay*, which is orthogonal to placement and touches no `data-tip-pos` value.
- **The notification bell** and its shared panel (`notification-panel`).
- **Page-level escaping** for Files, Uploads and Settings (`markup-escaping-and-security-boundary`, `upload-markup-escaping`, `settings-truthful-ui`). Those own page modules; this change owns the shared `Modal`.
- **The `[data-tip]` mechanism stays CSS-only** (no JS tooltip engine), per the no-build constraint.
- **All server behaviour.** No endpoint, service, schema or API shape changes. This is a client-layer change only.
- The **existing visual language**. Violet stays violet, the monochrome inverted-surface `.btn-primary` stays monochrome (it already carries 15-17:1 contrast and is the reason this app does not read as AI-slop), and the restrained accent usage stays restrained.
- **The honest-`null` rendering rules**, the real skeleton/empty/error states, and the toast burst-eviction lifecycle, which are already correct.

## Capabilities

### New Capabilities

- `dialog-focus-management`: the shared `Modal` module — focus trap, Escape scoping, focus restore, accessible naming, escaping of caller-supplied strings, and layout stability on open and close.
- `color-contrast`: WCAG AA for text in both themes — the tertiary text token, the selection highlight, and the link colour — with a measured-ratio test so the bar cannot regress.
- `control-hit-areas`: minimum interactive target size for buttons, icon buttons and row-level controls on touch-capable viewports.
- `frontend-motion`: how the interface moves — the reduced-motion contract, action feedback, page transition, and the rule that animated properties stay on the compositor.
- `design-tokens`: the shared token layer — self-hosted typography, the font-family contract, the corner-radius scale, and removal of the pure-black and rainbow-gradient values.

### Modified Capabilities

None. No existing spec's requirements change: the three in-flight frontend changes own the page-level surfaces this change deliberately leaves alone, and `dashboard-frontend` governs Dashboard panel semantics rather than the shared shell.

## Impact

**Affected code**

- `public/assets/js/app.js` — `Modal` (open/close/confirm/prompt), `Toast`, `ContextMenu`, and the shared `Icons`/`Format` helpers if the duration constant is consolidated.
- `public/assets/js/router.js` — transition hook, `is-navigating` lifetime, scroll restoration.
- `public/assets/js/uploads.js` — progress tick cadence, or the CSS that consumes it.
- `public/assets/js/theme.js` — only if a `theme-color` update is needed alongside token changes.
- `public/assets/css/tokens.css` — colour, radius and font tokens.
- `public/assets/css/base.css` — reset, selection, keyframes, transition utilities.
- `public/assets/css/components.css` — buttons, inputs, toasts, modals, tooltips, spinners, skeletons.
- `public/assets/css/themes.css` — light and dark token blocks.
- `public/assets/css/layout.css`, `dashboard.css`, `files.css`, `uploads.css`, `settings.css`, `admin.css`, `login.css` — animation declarations and the 94 `--text-tertiary` consumers.
- `public/*.html` — only if a dialog gains static labelling attributes.

**Affected tests**

- `test/frontend/` — new assertions for the focus trap, Escape, focus restore, contrast ratios, hit areas, the reduced-motion contract, and the absence of `transition: all`.
- `test/frontend/tooltips.test.js` — must keep passing unchanged; the delay must not alter placement.
- `test/frontend/files.test.js`, `uploads.test.js` — must keep passing; the Files drawer focus model is owned by `files-page-correctness`.

**Dependencies**

None added. No new package, no CDN, no framework. Motion work is CSS plus the existing `requestAnimationFrame` and `IntersectionObserver` primitives already used in `dashboard.js`.

**Risk**

- Raising `--text-tertiary` changes the colour of 94 rules across nine stylesheets at once. It is a single-token change with a wide blast radius, which is why it needs a measured-ratio guard rather than eyeballing.
- Motion work touches files that three in-flight changes also touch (`files.css`, `uploads.css`, `components.css`). Task ordering in `tasks.md` sequences this change so shared-layer edits land before the page-level ones merge.