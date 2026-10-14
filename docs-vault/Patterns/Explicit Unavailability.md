---
title: Explicit Unavailability
type: pattern
language:
  - javascript
status: generated
complexity: medium
dependencies:
  - "[[Storage Services]]"
  - "[[HTTP API Layer]]"
  - "[[Frontend Core]]"
  - "[[Feature Pages]]"
related-notes:
  - "[[Truthful Reporting and Unavailability]]"
  - "[[Bounded Work Budgets]]"
  - "[[Limitations]]"
canonical-source: src/services/FileSystemService.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - pattern
---

# Explicit Unavailability

## What it is

**Unknown is not zero.** When the server cannot measure a quantity, it reports `null` together with an `*Available: false` flag, or it omits the field entirely. When the client gets such a value, it renders `—`. Neither side substitutes `0`, a floor of `1`, or a plausible-looking value, and neither side asserts a status (healthy/warning/critical) unless a real threshold defines it. The reverse also holds: a measured `0` is a real reading and is shown as `0`.

## Why this codebase uses it

- AGENTS.md, Hard Constraints: *"A count of `0` is a real reading, not a placeholder"*. It also says that a quantity that could not be measured *"must be reported as explicitly unavailable (`null` plus an `*Available: false` flag) and rendered as 'unavailable', never as `0`."*
- AGENTS.md: *"Never fabricate a metric to fill a UI slot... remove the affordance that wanted it."* No time-series store exists, so the Dashboard has no trends and no sparklines.
- ADR-002 decision 3: *"Unreadable capacity is `null`, `volumeAvailable: false`, and HTTP 200 — never `0`."* ADR-002 also rejects fabricating a trend series.
- `getHealthMetrics` omits load average and ships no `status` field, because `os.loadavg()` returns `[0,0,0]` on Windows and there is no error to detect.
- ADR-004 and the Upload page invariants: remaining time before a speed has been measured is `—` (`Format.duration(null)`), and a computed remaining time is labelled an estimate.

## Where it appears

- [[Storage Services]]:
  - `FileSystemService.computeCapacity` / `getVolumeStats` return `volumeAvailable`.
  - `getHealthMetrics` omits metrics it cannot measure.
  - `getTreeStats` reports `truncated` and an `errors` list instead of a silently short total.
- [[HTTP API Layer]]: in `src/controllers/fs.controller.js`, `getList` sets folder `size: null` with `sizeAvailable: false` when the walk truncated or hit inaccessible entries. `src/controllers/dashboard.controller.js` passes the volume flags through.
- [[Frontend Core]]: in `public/assets/js/app.js`, `resolveStorageDisplay` is a pure resolver. An unmeasured volume renders `—`, gets no `aria-valuenow`, and shows an outlined bar rather than a filled one.
- [[Feature Pages]]: `public/assets/js/dashboard.js` uses `UNAVAILABLE_MARK = '—'`. `public/assets/js/uploads.js` uses `Format.duration(null)`.

## Code excerpt

> [!example] `src/services/FileSystemService.js`: a degenerate reading is an absence, not zero
> ```js
> static computeCapacity(statfsResult) {
>     const unavailable = { usedBytes: null, totalBytes: null, volumeAvailable: false };
>     if (!statfsResult || typeof statfsResult !== 'object') return unavailable;
>     // ...
>     const totalBytes = bsize * blocks;
>     // A degenerate or nonsensical reading is not a measurement of zero volume.
>     if (totalBytes <= 0 || blocks < 0 || bavail < 0 || bavail > blocks) return unavailable;
>     return { usedBytes: bsize * (blocks - bavail), totalBytes, volumeAvailable: true };
> }
> ```

> [!example] `public/assets/js/app.js`: the client honours the flag
> ```js
> if (s.volumeAvailable !== true || used === null || total === null || total <= 0) {
>   return { available: false, pctText: UNAVAILABLE_MARK, fillWidth: '0%', /* ... */ severity: null, pctValue: null };
> }
> ```

## Pitfalls and known violations

> [!warning] Metadata failure on the Dashboard is rendered as "empty"
> `dashboard.controller.js` `getSummary` wraps the metadata read in a bare `catch {}` and degrades `activities` / `topFiles` to `[]`. A client cannot tell "no activity yet" from "store unreadable". This is the exact substitution the rule forbids. It also contradicts AGENTS.md, which says a corrupt store makes the summary a 500 (HTTP API Layer, "Dashboard metadata failure is silent and indistinguishable from 'empty'", medium). The suggested fix is an additive `metadataAvailable: false` field, which v1 allows.

- **A 200 does not mean every field is populated.** Per-capability degradation (ADR-002) means consumers must check the flags before rendering, not just `res.ok`.
- **Degradation is not uniform.** A tree/volume failure inside `Promise.all` is still a 500. Decide per capability whether to degrade or fail wholly (AGENTS.md).
- **Failure renders as success on the client.** `copyToClipboard` reports success when the copy failed, and download failures are invisible to the user (Frontend Core issues 4 and 5). Both are the same failure in different clothes: claiming an outcome that was not observed.
- **Read-side sanitization matters too.** `MetadataService.getActivities` / `getTopDownloads` drop zero or invalid timestamps and counts rather than rendering them as real values.

## How to apply it in new code

1. On the server, return `null` plus a `<thing>Available: false` flag (or omit the field) for anything you could not measure. Never `0`, never `|| 1`.
2. Add the flag as a new optional field. Within `/api/v1` that is an additive change (ADR-007). Document it in `docs/CONTRACTS.md`.
3. On the client, write a pure resolver that maps `{value, available}` to a view model. Render `—`, drop progress `aria-valuenow`, and give it no severity.
4. If no source exists for a figure (trend, period total, status level), remove the UI slot instead of inventing a value.
5. Label scoped or estimated figures honestly, e.g. "since this page opened" or "estimate".
