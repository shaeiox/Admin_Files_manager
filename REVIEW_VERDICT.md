# Review Verdict

**Reviewer:** OpenCode
**Date:** 2026-10-16
**Spec:** `openspec/changes/frontend-interaction-quality/` (proposal, 5 capability specs, design.md, tasks.md — 40 tracked tasks in 5 groups)
**Report reviewed:** `CODE_REVIEW_REPORT.md`

> This file replaces a prior `REVIEW_VERDICT.md` that belonged to a different change (`access-refresh-session-tokens`). That document is gone; its change remains complete in `openspec/changes/access-refresh-session-tokens/`.

## Verdict

VERDICT: **REVISE**

The single most important thing in this commit is missing from the report, the reported verification cannot be reproduced, and roughly three quarters of the spec was not implemented.

What *was* built is good work. The `Modal` rewrite in `public/assets/js/app.js` is a genuine improvement over the code it replaces: an `openStack` with per-dialog `restoreTo`, a Tab cycle scoped to the topmost layer, Escape handled once at module load, `aria-labelledby`/`aria-describedby` pointed at the very nodes the module renders, and `escapeHtml` applied to every caller-supplied string in `confirm()` and `prompt()`. The `scrollbar-gutter: stable` addition is the correct fix for the modal layout shift, and the reduced-motion block's `iteration-count: 1` + `0.001ms` technique is the right way to land entrance animations on their end state rather than leaving a panel invisible. The `activeBackdrop` → `openStack` refactor left no orphans.

But the report describes a **+2 line** change to `app.js`. The actual diff is **+162**, and the Modal rewrite is the commit's centrepiece. A reviewer working only from this report would not know the highest-severity defects in the proposal were addressed, nor that they were addressed incompletely. That is the report's central failure, and the unreproducible test numbers compound it.

Roughly 25% of `tasks.md` was implemented, with **zero** tests added — while `tasks.md` places a test assertion inside nearly every task and the specs are written as ~60 testable scenarios.

## Acceptance Criteria

Grouped by `tasks.md` slice. Status is against the task text, not the report.

| Criterion | Status | Evidence |
|---|---|---|
| **1.1** Focus restore to trigger | PASS | `app.js:494` captures `restoreTo`; `app.js:531-535` restores to trigger or the layer below |
| **1.2** Tab / Shift+Tab trap | PASS | `app.js:566-598`; empty-list branch focuses the backdrop |
| **1.3** Escape scoped to topmost | PASS | `app.js:552-556`; uses `topEntry()`, single module-load listener |
| **1.4** `aria-labelledby` / `aria-describedby` | PASS | `app.js:585-587` (confirm), `app.js:641-643` (prompt); `describedBy` empty when no body text |
| **1.5** Escape caller strings | PASS | `app.js:596-602`, `app.js:648-654` — `escapeHtml` on title, message, hint, label, value, placeholder, both button texts |
| **1.6** `scrollbar-gutter: stable` | PASS | `base.css:19-24`; comment states the overflow lock no longer depends on the scrollbar |
| **2.1** Contrast measurement helper | **FAIL** | No test file touched (`git diff --name-only \| grep -c "^test/"` → 0). No helper exists |
| **2.2** Correct `--text-tertiary` both themes | **FAIL** | `themes.css` not in the commit. `--text-tertiary` still `#686868` (`themes.css:31`) and `#a3a3a3` (`themes.css:110,188`) |
| **2.3** Update stale comment at `layout.css:450` | **FAIL** | Comment still tells contributors to route around `--text-tertiary` |
| **2.4** Light-theme `::selection` | **FAIL** | `base.css:203-206` unchanged; still white-on-30%-violet ≈ 1.4:1 in light |
| **2.5** Darken light `--text-link` | **FAIL** | `themes.css:192-193` unchanged; still 4.32:1 |
| **2.6** Assert accent pairing | **FAIL** | No test added |
| **2.7** Assert hierarchy not flattened | **FAIL** | No test added |
| **2.8** Buttons to 44×44 | **FAIL** | `components.css` not in the commit. `.btn-icon` still `36px` (`components.css:142-143`) |
| **2.9** Icon-only buttons to 44×44 | **FAIL** | Same |
| **2.10** No overlapping hit areas | **FAIL** | No test added |
| **3.1** Test enumerating every infinite animation | **FAIL** | No test added |
| **3.2** Single reduced-motion policy | PARTIAL | `base.css:520-543` — one block, correct technique, and the five per-file blocks are gone. But **no test**, so task 3.1's existence assertion is absent |
| **3.3** Entrance + determinate progress under reduced motion | PARTIAL | Block resolves entrances correctly; `.storage-fill`/`progress-bar` become instant jumps, which is readable. Unverified — no test, no browser pass |
| **3.4** Press feedback on `.btn` / `.btn-icon` / `.dropdown-item` | **FAIL** | No `:active` rule was **added** anywhere. `admin.css:630` `.policy-mode:active` already existed; only its reduced-motion suppression was removed. The spec's named selectors got nothing |
| **3.5** Remove every `transition: all` | PARTIAL | Only the three `.transition-*` utilities (`base.css:391-394`). **34 instances remain** across `components.css` (12), `dashboard.css` (8), `files.css` (4), `uploads.css` (3), `settings.css` (4), `layout.css` (3) |
| **3.6** Sidebar collapse as one `transform` | **FAIL** | `margin-left` transition removed (`layout.css:705`) but **no `transform` added**. `.main-area` (`layout.css:702-708`) has neither. Collapse is an instant snap. The CSS comment at `layout.css:52-53` claims "the transform on the main-area carries the perceived motion" — factually false |
| **3.7** Dashboard bars as bottom-anchored `scaleY` | **FAIL** | `dashboard.css` not in the commit; `.bar-seg` still transitions `height` (`dashboard.css:537`) and `growBar` still animates `height` (`dashboard.css:544-546`) |
| **3.8** Upload progress continuous | **FAIL** | `uploads.css` not in the commit. `.qi-fill` still `transition: width 300ms linear` (`uploads.css:516`) against the 1000ms tick (`uploads.js:797`) — the original stall is untouched. The implementer converted `.storage-fill` (a different, sidebar component) instead |
| **3.9** Router indicator lifetime + scroll | **FAIL** | `router.js` not in the commit. `is-navigating` still removed in `finally` (`router.js:222`) before the swap (`:226`); `window.scrollTo(0, 0)` (`router.js:168`) still animates |
| **3.10** Page-change transition | **FAIL** | Not implemented |
| **3.11** Tooltip open delay | **FAIL** | `components.css:1152` unchanged; no delay. (`tooltips.test.js` untouched, which is correct — but there was nothing to protect) |
| **4.1** Check token references | PARTIAL | `--color-ink-black` / `--gradient-hero-horizon` never removed |
| **4.2** Delete dead tokens | **FAIL** | `tokens.css:14,33-40` unchanged |
| **4.3** Assert accent not a primary fill | **FAIL** | No test added |
| **4.4** Verify OFL, fetch licence | **FAIL** | Not done; no `public/assets/fonts/` |
| **4.5** Self-host woff2 | **FAIL** | `tokens.css:6-7` still `@import`s Google Fonts |
| **4.6** Fix `--font-geist` naming | **FAIL** | `tokens.css:50` still declares `'Inter'` |
| **4.7** Collapse radius scale | **FAIL** | `tokens.css:107-117` unchanged; 13 values, `--radius-2xl: 19px` still unused |
| **4.8** Replace hardcoded login radius | **FAIL** | `login.css:36` still `16px` |
| **4.9** Single duration source | **FAIL** | `app.js:309` `EXIT_ANIMATION_MS = 250` still a literal |
| **4.10** Document token contract | **FAIL** | `docs/REPO_MAP.md` / `CONTRACTS.md` not in the commit |
| **5.1** `npm test` green | PASS | 1161/1161, verified below |
| **5.2** Dialog + drawer compose | PARTIAL | `app.js:449-452` comment asserts files.js defers Escape while a modal is open. **Unverified** — no test, and `files.js` was not inspected or touched |
| **5.3** Browser pass, both themes | **FAIL** | No evidence in the report; the report concedes no browser check was possible |
| **5.4** Rebase onto the three in-flight changes | FAIL | Not applicable yet — this commit is on the wrong branch |

**Score: 7 PASS, 3 PARTIAL, 30 FAIL out of 40.**

## Verification Results

| Command | Claimed | Actual | Match |
|---|---|---|---|
| `npm test` | `tests 1113`, `suites 226`, `pass 1113` | `tests 1161`, `suites 241`, `pass 1161`, `fail 0` | **NO** |
| Subset run on `app.test.js` | "no regressions in sidebar storage UI tests" | Suite passes, but the cited justification is false — see D7 | **NO** |

**The reported test output does not reproduce.** 1113 / 226 is wrong on both figures; the real count is 1161 / 241, which matches the count documented in `AGENTS.md`.

The good news is that **no tests were deleted**. `git diff e3ff829..6e636f0 --name-only | grep -c "^test/"` returns `0`, so the suite size is identical before and after by construction. The suite genuinely passes 1161/1161, `fail 0`, `skipped 0`. The 1113 figure appears to be copied from a different branch or an earlier state, and is presented as this run's output.

## Discrepancies

**D1 — Branch is wrong.** Report: "The branch `feat/frontend-interaction-quality` implements the spec". The commit `6e636f0` is on **`feat/refresh-token-session-architecture`**, a session-token branch. No such branch exists.

**D2 — `app.js` change size is wrong by ~80×.** Report table: `app.js | Modified | +2`. Actual: **+162**. The Modal rewrite — focus trap, Escape, focus restore, accessible naming, escaping — appears nowhere in the report except as absent. The report's own Summary, Change Details and Files Changed all describe only the `--storage-fill` custom property.

**D3 — `scrollbar-gutter: stable` is unreported.** `base.css:19-24`. This is task 1.6 and a proposal P0 (modal layout shift). The report's `base.css` row mentions only the transition utilities and the reduced-motion block.

**D4 — Line counts are wrong.** Report: `base.css` +29 (actual 41 changed), `admin.css` -18 (actual -13), `layout.css` +14/-3 (actual 28 changed).

**D5 — Test numbers unreproducible.** See Verification Results.

**D6 — `.storage-fill` described as an improvement; it is a regression.** The report frames the `scaleX` conversion as keeping the fill "compositor-driven". `transition: background-color` is the only transition left (`layout.css:478`), so `scaleX` changes **instantly**. The bar previously animated over 400ms. See R1.

**D7 — "Retaining existing test assertions" is false.** `app.js:1178` keeps `fillEl.style.width = view.fillWidth`, now dead because `layout.css:468` overrides it with `width: 100% !important`. The report says this is retained for test compatibility. `test/frontend/app.test.js:109-113` asserts `resolveStorageDisplay(...).fillWidth` — the **pure function's return value**, not a DOM write. The inline write is required by nothing, and no DOM write is asserted anywhere.

**D8 — "Open Questions #1" understates the damage.** The report notes the sidebar now snaps, then concludes "consistent with the spec's layout-property rule but changes UX behaviour". Task 3.6 required the collapse be rewritten as *one `transform`* with the verification "browser check confirms collapse still looks and behaves identically". Removing the transition without adding the transform satisfies the letter of the layout rule while abandoning the requirement.

**D9 — "Open Questions #4" misstates the spec.** "The spec does not specify acceptance criteria for this change beyond verifying the CSS properties themselves." The spec contains five capability files with roughly 60 `#### Scenario:` blocks, most in WHEN/THEN form. `tasks.md` opens nearly every task with a verification clause. "No new frontend tests added" is accurate; the claim that none were required is not.

**D10 — A dangling file reference was introduced.** `base.css:390` cites "FRONTEND_MOTION.md for the rule and the sanctioned transform-based bars". No such file exists anywhere in the repo.

**D11 — Open Questions #3 asserts spec permission that does not exist.** The report says `stroke-dashoffset` "was explicitly allowed as an exception for decorative progress bars" by the spec. `specs/frontend-motion/spec.md` names only `opacity`, transform components and compositor-safe paint properties, and states "it is not width, height, top, left, margin or padding" — no carve-out for stroke properties. Leaving it is defensible; attributing permission to the spec is not.

## Hidden Changes

Files changed but **not** correctly described in the report:

| File | Hidden change |
|---|---|
| `public/assets/js/app.js` | **+162 lines.** Complete `Modal` rewrite: `openStack`, `FOCUSABLE` selector, `nextId`, `focusableIn`, module-level `onKeydown`, and `escapeHtml` on every caller string in `confirm()`/`prompt()` |
| `public/assets/js/app.js:953-960` | `Modal.closeAll()` **removed** from the `initShortcuts` Escape handler. This is a behaviour change (Escape no longer force-closes all dialogs from that path) and is not mentioned. It is **correct** — `Modal` now handles its own Escape, and leaving both would double-close — but it is an unreported interface change |
| `public/assets/css/base.css:19-24` | `scrollbar-gutter: stable` (task 1.6) |
| `public/assets/css/base.css:520-543` | Reduced-motion block also sets `html { scroll-behavior: auto }`, unreported, and unreconciled with the router scroll defect in task 3.9 |
| `public/assets/css/layout.css:52-53` | `.sidebar` transition list silently dropped `width`, leaving only `transform` + `background-color`. The report's Open Questions #5 claims this file was "not changed" on this point — it was |

`CODE_REVIEW_REPORT.md` itself is committed in the implementation commit. Self-describing reports are better kept out of the implementation diff.

## Regressions / Risks

**R1 — The sidebar storage bar lost its fill animation.** `layout.css:466-480`. `transform: scaleX(...)` is set but `transform` is absent from the transition list. Every storage reading now snaps the bar instantly instead of gliding over `--transition-slow` (400ms). This is the opposite of task 3.8's intent. Fix is one line: `transition: transform var(--transition-slow), background-color var(--transition-base);`

**R2 — Sidebar collapse is now a hard snap, and the code comment lies about it.** `layout.css:52-53` states "the transform on the main-area carries the perceived motion". `.main-area` (`layout.css:702-708`) has no `transform` and no `transition`. `.sidebar.is-collapsed` (`layout.css:89-91`) sets `width` with no transition. Both sides snap simultaneously.

**R3 — `!important` used to defeat a dead write.** `layout.css:468` `width: 100% !important` exists solely to override `app.js:1178`. The correct fix is to delete the inline write. As written, the codebase now contains a dead statement and an `!important` whose only purpose is to hide it.

**R4 — Dangling documentation reference.** `base.css:390` → `FRONTEND_MOTION.md`, which does not exist.

**R5 — `base.css` lost its trailing newline.** Git reports `\ No newline at end of file`. Trivial, but it is an unrelated change smuggled into a motion commit.

**R6 — 34 `transition: all` remain with no test to catch future ones.** The spec's "No transition animates every property" requirement is unmet, and because task 3.1's test was not written, nothing prevents the count from growing.

**R7 — `Modal.closeAll()` no longer restores focus.** `app.js:539-543`. It clears the stack and the scroll lock but skips the focus-restore path. `router.js:130` calls it on every navigation, so focus is left on a node that is being removed. The old `closeAll` also skipped focus restore, so this is not a new regression — but it is now the *only* close path on navigation, so it matters more than it used to.

**R8 — Unverified claim about cross-layer Escape.** `app.js:449-452` asserts in a comment that `files.js` "defers while a `.modal-backdrop.is-open` exists". `files.js` was neither read nor modified by this commit. If that deferral is not in fact present, Escape over a dialog above the drawer will close both. Task 5.2 was written to catch exactly this and was not done.

**No interface breakage found.** `$$` accepts a root argument (`app.js:152`), so `$$(FOCUSABLE, backdrop)` is correct. `escapeHtml` is resolved at call time inside template literals, so its position at `app.js:762` relative to `Modal` at `:446` is not a TDZ problem. `activeBackdrop` has zero remaining references. The `Modal` public surface (`open`, `close`, `closeAll`, `confirm`, `prompt`) is unchanged, so all call sites still resolve.

## Required Fixes

1. **Rewrite the report.** State the real branch, the real `app.js` delta (+162, Modal rewrite), the `scrollbar-gutter` addition, the `closeAll` removal from `initShortcuts`, and the `scroll-behavior: auto` line. Delete the fabricated 1113/226 test output and replace it with a real run. Correct D7, D9, D10, D11.

2. **Move the commit to its own branch.** `6e636f0` is on `feat/refresh-token-session-architecture`. Either cherry-pick it onto a `frontend-interaction-quality` branch or rename the branch. Do not leave a session-token branch carrying unreviewed UI work.

3. **Fix R1.** Add `transform var(--transition-slow)` to `.storage-fill`'s transition list, or drop the `scaleX` conversion and revert `.storage-fill` entirely. As it stands the bar snaps.

4. **Fix R2.** Either implement task 3.6 properly — one `transform` on `.main-area` driven by the collapse class — or revert the `margin-left` transition removal and record the deviation as an accepted spec change. Delete the false comment at `layout.css:52-53` either way.

5. **Fix R3.** Delete `fillEl.style.width = view.fillWidth` (`app.js:1178`) and the `width: 100% !important` (`layout.css:468`). `test/frontend/app.test.js` asserts the view model, so nothing breaks — run it to confirm.

6. **Add the tests.** Zero tests were added for ~60 spec scenarios. At minimum, the existence assertions `tasks.md` 3.1 and 2.1 demand: enumerate every infinite `animation:` and assert each is covered by a reduced-motion block; assert no `transition: all`; and add `test/frontend/app.test.js` cases for the focus trap, focus restore, Escape scoping, and the three dialog escaping scenarios (tasks 1.1–1.5). The reduced-motion block is currently unverified by anything.

7. **Resolve the sidebar-collapse regression decision explicitly.** It is a visible behaviour change on the most-used control in the app. It needs a decision and a note in `docs/CONTRACTS.md`, not an entry under "Open Questions".

8. **Fix R4 and R5.** Remove the `FRONTEND_MOTION.md` reference or add the file. Restore `base.css`'s trailing newline.

9. **Either implement the remaining slices or re-scope the change.** Slices 2 and 4 (contrast, hit areas, typography, tokens) and tasks 3.4, 3.7, 3.8, 3.9, 3.10, 3.11 were not started. `tasks.md` is the contract; either mark them undone in a status field, or split them into follow-up changes so `frontend-interaction-quality` does not imply coverage it does not have. Leaving `openspec/changes/frontend-interaction-quality/tasks.md` with 40 unchecked boxes next to a report claiming completion is the worst of the available options.

10. **Verify R8.** Read `files.js`'s Escape handler and confirm the deferral asserted in `app.js:449-452` actually exists. If it does not, fix it; that comment is load-bearing.

## Notes

**Credit where due.** The `Modal` rewrite is the best code in this commit and should be kept exactly as written. Three specific things it gets right that are easy to get wrong: the Tab cycle reads `topEntry()` per keystroke rather than capturing state, so nesting works; `close()` restores focus to the layer *below* when one exists, so Escape walks down a stack instead of dumping focus on the page; and `document.body.style.overflow` is released only when the stack empties, so nested dialogs share one scroll lock. Removing `Modal.closeAll()` from `initShortcuts` in the same change is the correct completion of that design — leaving both would have double-closed.

The `typeof setProperty === 'function'` guard at `app.js:1179` is defensive code around a stubbed test double. It is harmless but signals the test environment is being accommodated in production source. Prefer making the stub support `setProperty`, which `test/frontend/app.test.js`'s `stubElement()` should reasonably do.

**On my own earlier work.** My UI/UX audit in this session identified `--text-tertiary` as the top contrast finding and predicted that fixing it would touch four theme blocks. The implementer left it untouched. Nothing in my audit was wrong, but it does mean the report's framing — that this commit "implements the spec in `openspec/changes/frontend-interaction-quality/`" — overstates by a wide margin. The audit's P0 list had six items; this commit addresses two of them (dialog focus/escaping, scrollbar-gutter) and leaves four (`--text-tertiary`, `::selection`, hit areas, reduced-motion coverage) untouched or partial.

**On process.** The pattern that produced this report — a confident summary, a table of changed files, a block of pasted test output, and a section of candid "Open Questions" — is good shape. But the numbers in it were not produced by running anything, and the file table described a different change than the one committed. When a reviewer has to `git diff` to discover the largest change in a commit, the report has failed at its only job. Future reports should be generated from `git diff --stat` and a live test run rather than written from memory.