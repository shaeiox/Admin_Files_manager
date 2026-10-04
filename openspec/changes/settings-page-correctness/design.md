# Design

## Context

See `proposal.md` — Why for the defect evidence. The constraints that shape this design:

- The repo's only persistence pattern is `MetadataService`: an instance singleton holding `this.dbPath = path.join(process.cwd(), 'data', 'metadata.json')`, an in-memory cache, atomic temp-file-then-rename writes, `ENOENT` bootstrap on first read, and `AppError` wrapping on failure. Tests redirect `dbPath` to a temp file before requiring `server.js`.
- `.gitignore` already excludes `data/*.json`, so a new `data/settings.json` needs no ignore change.
- AGENTS.md rule 6 fixes the envelope conventions; rule 2 fixes `PathService` as the only path-resolution boundary; rule 8 forbids a frontend build step and fixes the page-module contract (`init`/`destroy`/`beforeLeave`, router swaps).
- `test/frontend/navigation.test.js` pins current Settings behaviours (notice on 404, save-explains-instead-of-sending, hidden notice markup with the phrase "not stored by the server"). `test/frontend/files.test.js` pins byte-identical sidebars across the four pages.
- Verified during planning: **no CSS hooks exist** for density, reduce-motion, or per-page view attributes — so those Appearance controls have no possible effect and are removed, not persisted.
- `upload-pipeline-correctness` (in flight, 107/109) owns `uploads.js`; `notification-panel-and-tooltip-placement` (scaffolded) owns the topbar bell surface.

## Goals / Non-Goals

**Goals:**

- A real, validated, atomically persisted settings document with exactly the keys that produce observable behaviour.
- A Settings page where every surviving control works end to end (markup → module → HTTP → store → consumers).
- Removal of every fabricated claim and dead control, with honest residue where a group deserves mention.
- Consumers (sidebar brand, Uploads destination, Files view) that degrade invisibly when the store is unreachable.

**Non-Goals:**

- Authentication, API keys, webhooks, integrations, notifications, scheduling, trash/recycle, workspace ownership — all deferred; each is its own future change, most gated on ADR-003 (auth) landing first.
- `POST /api/settings/action` or any destructive settings endpoint.
- Density, reduce-motion, and show-thumbnails preferences (no CSS hooks exist; adding the hooks is a separate design).
- A settings search/filter feature (the surviving page is too small to need one).
- Changing `MetadataService`, `theme.js`, `router.js`, `api.js`, or any sidebar markup.

## Decisions

### D1 — JSON at `data/settings.json`, modelled on `MetadataService`

`SettingsService` is an instance singleton with the same shape: constructor-resolved `dbPath` (`path.join(process.cwd(), 'data', 'settings.json')`), in-memory cache, `_read`/`_write` with temp-file-then-rename, `ENOENT` bootstrap, `AppError` wrapping with static messages (no path/errno leakage). **JSON over XML** (choice delegated by the user): JSON is the repo's established convention, needs zero new dependencies, and is trivially validated with plain JS; XML would add a parser dependency, a hand-rolled serializer, and a second persistence idiom for no benefit. The file is covered by the existing `data/*.json` ignore rule.

### D2 — Schema v1 persists only what works

```json
{
  "general":    { "workspaceName": null, "defaultUploadFolder": null },
  "appearance": { "defaultView": null }
}
```

`null` is the explicit unset state (consistent with the repo's null-for-absence convention): brand falls back to the static markup text, destination falls back to `/`, view falls back to `list`. The theme is **not** in the document — it stays browser-local in `theme.js`. Everything else the page used to show is removed; the inventory below is the removal authority (each row follows the quota-panel/API-keys precedent: remove the affordance, or replace with an explicit unavailable note):

| Removed | Was | Replacement |
|---|---|---|
| Language, timezone selects | General pane | None (no i18n/formatter consumer) |
| Auto-organize, auto-thumbnails, deduplication switches | General pane | None (no upload pipeline features) |
| Density segmented, reduce-motion + show-thumbnails switches | Appearance pane | None (verified: no CSS hooks) |
| Auto-purge temp switch; "Retention & lifecycle" group | Storage pane | None (no scheduler) |
| 2FA "Enabled" badge + Manage, SSO Configure, session timeout, encryption-at-rest, virus scan, password links, watermarking | Security pane | Honest note: no authentication or security subsystem exists in this build (same style as the API-keys note) |
| Webhook URL input, trigger-event tags, Add-event button | API Keys pane | None |
| Entire integrations grid (six cards, fabricated statuses) | Integrations pane | Entire pane removed, including its nav item |
| Five notification toggles | Notifications pane | Entire pane removed, including its nav item |
| Empty trash, revoke keys, transfer ownership, delete workspace | Danger Zone pane | Entire pane removed, including its nav item; returns only with an auth-gated design |
| Topbar "Search settings…" input | settings.html topbar only | Removed from this page; a real filter can return as its own change |
| "deleted from the Linux disk" copy | Danger confirm | Pane removed; any future destructive copy names permanence without a platform |

**As shipped:** the Settings nav keeps five panes — **General** and **Appearance** are the two
configurable sections; **Storage**, **Security** and **API Keys** remain as *note-only* panes, each
carrying an explicit unavailable note (the quota and API-keys notes the design names as its pattern),
because removing the pane would have deleted the honest residue itself. The **Integrations**,
**Notifications** and **Danger Zone** panes and their nav entries are removed. The `?pane=` deep-link
silently no-ops on a removed pane (falls through to General) — acceptable, recorded here.

**Deferred:** `general.defaultUploadFolder` is persisted and validated, but its consumer
(`uploads.js` reading it as the initial destination, task 5.4) is gated on `upload-pipeline-correctness`
archiving, so it shipped unconsumed. The page's copy says so rather than claiming the Uploads page
starts there. Recorded in ADR-006 and in `docs/CONTRACTS.md`.

### D3 — Envelope: bare read, enveloped write, handler-thrown errors

`GET /api/settings` → bare settings object (read-only aggregate precedent: tree/list/summary/health/capability). `PUT /api/settings` → `{ success: true, settings }` (mutating precedent). Errors only via `AppError` → `errorHandler` → `{ success: false, error }`. Documented in `docs/CONTRACTS.md` in the same change.

### D4 — PUT is a strict, validated full replace

The payload must contain exactly the whitelisted sections/keys (all present, none extra), with per-key constraints: `workspaceName` — `null` or string ≤ 60 chars (trimmed; `""` normalizes to `null`); `defaultUploadFolder` — `null` or a string passing `validateClientPath`; `defaultView` — `null | "list" | "grid"`. Unknown keys are **rejected (400)**, not stripped: silent stripping hides client bugs and, with full-replace semantics, a drifted client would otherwise look successful while dropping values. `validateSettingsPayload` lives in `src/utils/validators.js` beside the existing validators; the controller does no hand-rolled checks. Full-replace (vs JSON merge-patch) is safe because the document is tiny and the page's save always serializes the whole form.

### D5 — Corrupt store fails wholly (500), mirroring `MetadataService._read`

A corrupt/unreadable document throws `AppError(500)` from the service; `GET` returns the error envelope. This is the deliberate per-capability choice (same as the metadata store), **not** the degraded-200 dashboard pattern: settings are small and operator-recoverable, and substituting defaults would silently discard real configuration. Rationale recorded for ADR-006.

### D6 — Defaults materialize on first read

On `ENOENT`, the service creates `data/` (recursive `mkdir` **before** the write — the ordering bug `MetadataService._init` documents) and writes the D2 defaults, then serves from cache. First run needs no setup step.

### D7 — Path values validated, never resolved, by the settings layer

`defaultUploadFolder` passes `validateClientPath` before persisting. `SettingsService` and its controller never call `PathService.resolveSecurePath` and never touch `fs` beyond the store file. Upload-time destination handling already resolves via `PathService`; a prefilled destination travels the exact same path as a typed one. No new path-consuming code path is created, so rule 2's choke point is untouched.

### D8 — `workspaceName` is applied at runtime by shared chrome

A small `applyWorkspaceName(name)` helper in `app.js` sets the sidebar brand text (empty/unset → restores the static default). It is called (a) from `loadGlobalData()` after a **silent** settings fetch, and (b) from `settings.js` immediately after a successful save, so the operator sees the change without reload. Because the router keeps the sidebar DOM across page swaps, no per-navigation re-application is needed; `refreshChrome` is not extended. The four sidebars' markup stays byte-identical (test-pinned) — only runtime `textContent` changes.

### D9 — Consumers fetch silently, fall back to current behaviour

`uploads.js` (initial destination) and `files.js` (initial view) each read `GET /api/settings` with `{ silent: true }` during init and use the value only when present; failure changes nothing and shows nothing. The `uploads.js` edit is **sequenced after `upload-pipeline-correctness` archives** (it owns that file) and is one additive read plus a prefill — no queue-logic refactor. Precedence on the Files page: an explicit in-session/persisted view choice (per that page's existing rules) beats the setting; the setting only changes the *fresh-visit* default.

### D10 — The notice is repurposed, and its pinned test is updated

With a real store, the notice means "store unreachable", not "no store exists". New copy: settings are normally stored on the server; the store cannot be reached right now, so changes cannot be saved; the theme still applies (browser-local). This deliberately breaks the existing `navigation.test.js` assertion matching `/not stored by the server/` — the phrase would be false post-change, so the test is updated to the new copy in the same change (spec: settings-regression-coverage). The 404/unreachable *behaviours* the other assertions pin (notice shown, save explains instead of sending) remain valid and stay green.

### D11 — The page module keeps its contract; interference removed

`init`/`destroy`/`beforeLeave` stay as-is (router-pinned). The capture-phase `stopPropagation` block on `.theme-option` is deleted with no replacement — dirty-tracking listens to `change`/`input`, which buttons never fire, so no guard is needed. Save is gated on `serverBacked === true`; the `null` (loading) path uses the previously dead `state.isLoading` or is folded into the tri-state directly. Discard re-hydrates from the last good config, or resets controls to markup defaults when no config exists, with copy matching what actually happened.

### D12 — Frontend state model after the honesty pass

Hydration/extraction key off `name` attributes added to every surviving control, and a source-level test cross-asserts markup names ⇆ module keys in both directions (the B1 regression class). Segmented controls (only "Default view" survives) mark dirty only when the active option actually changes.

## Risks / Trade-offs

- [Full-replace + strict whitelist makes future schema additions touch three places (schema/validator/frontend) at once] → Accepted: the document is three keys; the alternative (silent stripping) hides drift. Recorded so a future schema bump updates `DEFAULTS`, `validateSettingsPayload`, and the form in one change.
- [`uploads.js` merge conflict with the in-flight `upload-pipeline-correctness`] → Consumer edit sequenced last, after that change archives; the edit is additive and minimal by design (D9).
- [One extra silent `GET /api/settings` per page load from consumers] → Negligible: in-memory cached read server-side; failures are silent by contract (settings-consumers spec).
- [`data/settings.json` is world-readable like `data/metadata.json`] → Same exposure class as the existing store; contents are non-secret by design (no credentials may ever be added to this document — noted in ADR-006).
- [Operators with bookmarks to `settings.html?pane=security` land on General] → Accepted (D2); no redirect machinery is warranted.
- [Updating the pinned notice test could mask a genuine regression] → The behaviour assertions (notice on failure, no silent PUT) are kept; only the copy regex changes, and the new copy is itself pinned (D10).

## Migration Plan

Purely additive on the backend: mount the router (one line, before the catch-all), add three new source files, one validators addition. No data migration — the store bootstraps itself on first read (D6). Frontend changes ship in the same release as the mount. Rollback: revert the mount line and frontend files; an orphaned `data/settings.json` is inert (unreferenced, gitignored).

## Open Questions

None that affect the specs, approach, or task breakdown. (Minor, deferrable: whether `workspaceName` should also feed `document.title` or shared-link copy later — brand text only in v1.)
