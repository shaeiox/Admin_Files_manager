# ADR-006 — Settings Store: Format, Scope and Validation

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Project maintainer
- **Tags:** backend, persistence, settings, security

## Context

The Settings page rendered six panes of enterprise configuration — Security, Integrations, Webhooks,
Notifications, Storage retention and a Danger Zone — and **none of it was connected to anything**. A
trace of `public/settings.html`, `public/assets/js/settings.js`, the shared chrome and the server
beneath them found:

- **No backend at all.** `GET /api/settings`, `PUT /api/settings` and `POST /api/settings/action` all
  hit the `/api` 404 catch-all. There was no settings route, controller or service anywhere in
  `src/`; the only persistence pattern in the repository was `MetadataService`.
- **Fabricated capability claims** — a "Two-factor authentication — Enabled" badge, AES-256 and ClamAV
  switches, integration cards reading "Connected", webhook trigger tags, five notification toggles,
  an auto-purge switch, and four danger actions for subsystems that do not exist. The API is
  unauthenticated (ADR-003), there is no trash (deletion is permanent), and the API Keys pane on the
  same page already said truthfully that no keys can be issued.
- **Dead controls inside the page's own client.** Every control was addressed by
  `input[name="…"]`/`extractPayload()` while the markup contained **zero `name` attributes**, so
  hydration and save were unreachable code; `Discard` announced success for a restore that never
  happened; and a capture-phase `stopPropagation` block on `.theme-option` killed the very theme
  picker the page claimed was the only working feature.

The constraint that shapes this decision is not "how do we store settings" but **"how little may we
promise"**. The project's own rules already forbid the alternatives: no capability may be claimed
without server behaviour, an unmeasurable quantity must be reported as unavailable rather than
invented, and stale docs are bugs. A settings store is the one place where an invented key becomes
persistent and silent, so the design had to make the honest option the cheap one.

## Decision

### 1. A dedicated JSON document at `data/settings.json`, not XML

`SettingsService` is an instance singleton modelled directly on `MetadataService`: a
constructor-resolved `dbPath` (`path.join(process.cwd(), 'data', 'settings.json')`), an in-memory
cache, `_read`/`_write` with temp-file-then-rename, `ENOENT` bootstrap (creating `data/` **before**
the write), and `AppError` wrapping with static messages so no path or errno reaches the client. The
file is already covered by the `data/*.json` ignore rule, so no ignore change was needed.

**JSON over XML**, as chosen by the maintainer: JSON is the repository's established persistence
idiom, it needs **zero new dependencies**, and it is validated with plain JavaScript object
inspection. XML would have added a parser dependency, a hand-rolled serializer, a second escaping
model for operator-supplied values, and a second persistence idiom — all for a three-key document.

The settings store is **separate from `data/metadata.json`**: download counters, stars and activity
have a different lifecycle (fire-and-forget, best-effort migration on rename) from operator
preferences (validated, transactional-ish, never partially written). `MetadataService` was not
touched.

### 2. Persist only what works — a scope rule, not a key list

**A control may only be persisted if some code reads the value and changes observable behaviour
because of it.** Everything else is removed from the page rather than stored as a no-op.

The shipped document is exactly three keys:

```json
{
  "general":    { "workspaceName": null, "defaultUploadFolder": null },
  "appearance": { "defaultView": null }
}
```

`null` is the explicit *unset* state, consistent with the repository's null-for-absence convention:
the brand falls back to the static markup text, the destination falls back to `/`, the view falls
back to the page's own default. The **theme is deliberately not in the document** — it stays
browser-local in `theme.js`, which owns it and says so on the page.

Removed, with their replacements recorded in `docs/CONTRACTS.md` ("Settings page: capability claims
removed"): the 2FA badge, SSO, session timeout, encryption-at-rest, virus scanning, password links
and watermarking; the integration cards and their buttons; the webhook endpoint and triggers; the
five notification toggles; retention/auto-purge; density, reduce-motion and show-thumbnails;
auto-organize, auto-thumbnails and deduplication; language and timezone; the workspace-URL field; all
four danger actions and the platform-specific "Linux disk" copy; the handlerless topbar search on
this page. A capability that genuinely does not exist is better **stated as unavailable** (the
quota panel, the security note, the API-keys note) than rendered as a control that does nothing.

`general.defaultUploadFolder` is the honesty test of this rule: it is persisted because the Uploads
page is its intended consumer, and it is documented as **stored but not yet consumed** until that
page reads it. A key with no consumer is a promise, not a feature.

### 3. `PUT` is a strict, validated full replace — unknown keys are a 400

`PUT /api/settings` accepts the **complete** document and replaces it. `validateSettingsPayload`
(lives in `src/utils/validators.js` beside the existing validators; the controller holds no
second whitelist) enforces an exact whitelist — `general` and `appearance` only, every documented key
present, nothing extra at any depth — plus per-key constraints: `workspaceName` `null` or ≤ 60
characters after trimming (`""` normalizes to `null`), `defaultView` `null | "list" | "grid"`, and
`defaultUploadFolder` `null` or a string that passes `validateClientPath` and reads as a client path
(rooted at `/`, no backslash, every segment passing `validateFileName`).

**Unknown keys are rejected, not stripped.** With full-replace semantics, silent stripping would let
a stale client that still sends a removed pane receive a `200` and quietly lose the values it sent —
a drifted client would look successful. A loud `400` is the honest failure.

Full replace rather than JSON merge-patch is safe because the document is three keys and the page's
save always serializes the whole form.

`defaultUploadFolder` is **validated, never resolved**: `SettingsService` and its controller import
no `PathService` and touch no filesystem object other than the store file. Resolution through the
secure path boundary happens at the point of use, like every other client path, so the settings layer
creates no new path-consuming code path.

Envelope, per the repository convention: `GET` is a read-only aggregate and answers a **bare
document**; `PUT` mutates and answers `{ success: true, settings }`, where `settings` is the
persisted, normalized document. Errors are only ever produced by throwing `AppError`.

### 4. A corrupt store fails wholly with 500 — it is never repaired or defaulted

`SettingsService._read` wraps every non-`ENOENT` failure, **including a `JSON.parse` failure**, as
`AppError('Settings store could not be read', 500)`, and the request fails. Defaults are never
substituted for an unreadable document.

This is a deliberate per-capability choice and deliberately **not** the Dashboard's degraded-`200`
pattern. The document is small, human-readable and hand-repairable, so failing loudly costs one
operator edit; substituting defaults would silently discard real configuration and leave the page
looking healthy while every preference has reverted. The Dashboard degrades because a *volume* reading
is genuinely optional; operator configuration is not.

### 5. No credential may ever live in this document

The API is unauthenticated (ADR-003) and `cors()` admits any origin, so **any web page the operator
visits can call `PUT /api/settings`**, and `data/settings.json` is world-readable on disk — the same
exposure class as `data/metadata.json`. It is therefore restricted to non-secret operator
preferences by rule, not by convention: no token, key, password, session identifier or endpoint
credential may be added to this document. A credential feature needs a design that authenticates the
read before it exists, not a field in this file.

### 6. The danger zone is deferred to an auth-gated change, not reimplemented

`POST /api/settings/action` — and any `DELETE`, reset or purge endpoint — **deliberately does not
exist**. `settings.routes.js` registers only `GET` and `PUT`; everything else under `/api/settings`
falls through to the `/api` catch-all and answers `404`.

The four removed danger actions (empty trash, revoke keys, transfer ownership, delete workspace)
have no server implementation, and adding one behind an unauthenticated, any-origin API would create
an unauthenticated destroy-everything endpoint. They return only as part of a change designed
alongside authentication (ADR-003), and each one needs its own answer for who is allowed to invoke
it. The Settings page holds no destructive control, so the absence is visible in the API surface
rather than hidden behind a disabled button.

## Alternatives rejected

- **XML (explicitly considered and chosen against).** A parser dependency, a hand-rolled
  serializer, an escaping model, and a second persistence idiom for a three-key document.
- **Reuse `data/metadata.json` with a `settings` block.** One store would have coupled operator
  preferences to fire-and-forget, best-effort metadata writes: a read-modify-write race between an
  activity append and a settings save, and a corrupt activity record would take the settings with it.
  Different lifecycles, different stores.
- **A database (SQLite and friends).** Adds a dependency, a schema migration story and a native
  build surface to store three keys. The repository's answer to persistence is a JSON file, and this
  document is small enough that a full-replace write is effectively a transaction.
- **Merge-patch (`PUT` with partial keys).** Needs per-key tri-state semantics (`absent` vs
  `null` vs a value), which is exactly the ambiguity that makes accidental data loss hard to see. The
  page always sends the whole form, so full replace is both simpler and safer here.
- **Silently stripping unknown keys.** Hides client drift behind a successful-looking response (see
  decision 3).
- **Degrading to defaults on corruption.** Looks healthy while quietly reverting real configuration
  (see decision 4).
- **Implementing the danger actions "properly".** Out of scope until authentication exists (decision
  6); a documented gap is safer than an unguarded delete endpoint.

## Consequences

- **The Settings page now persists real preferences**, and the only preference it does *not* persist is
  the theme — which the page now states on its own face. Save is gated on store reachability, so a
  save during the initial read can no longer fire a write at an endpoint of unknown existence.
- **A schema bump touches three places at once** — `defaultSettings()` in `SettingsService`,
  `validateSettingsPayload` in `src/utils/validators.js`, and the form in `settings.html` /
  `settings.js` — because an unknown key is a hard `400`. Accepted deliberately: three keys is a
  small surface, and the alternative (stripping) hides drift.
- **`data/settings.json` is a second runtime artifact** to think about when backing up or resetting
  state. It needs no ignore rule of its own (`data/*.json` covers it), but clearing `data/` clears
  **both** stores, and any restore must bring the settings document back or the pages fall back to
  their defaults with no indication that configuration was lost.
- **A corrupt store takes the settings endpoints down** (`500`) while the rest of the API keeps
  serving. Consumers fetch it silently, so the Dashboard, Files and Uploads pages are unaffected.
- **The Settings page shrank.** Security, Storage and API Keys remain only as explicit unavailable
  notes; Integrations, Notifications and the Danger Zone are gone with their nav entries. A bookmark
  to `?pane=integrations` / `?pane=notifications` / `?pane=danger` now falls through to General —
  accepted; no redirect machinery is warranted.
- **Deleting the feature is cheap:** revert the mount line and the frontend files. An orphaned,
  git-ignored `data/settings.json` is inert.