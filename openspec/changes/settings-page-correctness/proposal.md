# Proposal

## Why

The Settings page is a zombie: it renders six panes of enterprise configuration, and **almost none of it is connected to anything**. A full investigation of `public/settings.html`, `public/assets/js/settings.js`, the shared chrome (`app.js`, `theme.js`, `router.js`) and the server beneath them found that the page has **no backend at all**, that its own frontend is broken in ways that would matter even with one, and that it asserts server-side facts that are false — the same class of dishonesty `files-page-correctness` and `upload-pipeline-correctness` already removed from the other two pages. Settings is the last page carrying this debt.

**The backend gap (documented but unresolved).** `GET /api/settings`, `PUT /api/settings` and `POST /api/settings/action` do not exist — there is no settings route, controller or service anywhere in `src/`; all three hit the `/api` 404 catch-all (`server.js:42-44`). The page papers over this with a notice ("settings are not stored… only the theme applies"), which is honest about *persistence* but does nothing about the *false status claims* rendered beside it.

**Reproduced frontend defects** (static trace; the event-path analysis is deterministic per the DOM spec):

1. **Hydration and save are 100% dead code against the real DOM.** `hydrateForm()` and `extractPayload()` (`settings.js:107-146`) address controls by `input[name="…"]`, but `settings.html` contains **zero `name` attributes** on any control (only `<meta>` tags match `name="`). A fetched config can never reach a field; a save sends `{ general: { workspaceName: undefined, workspaceUrl: undefined } }`. `extractPayload` is a self-described mock ("we mock the extraction structure", `:137-138`) covering 2 of the page's ~25 controls.
2. **Discard lies.** `discardChanges()` re-applies `state.config`, which is `{}` when the store is missing and unmatchable to the DOM even when present — the user's edits stay in the fields while a toast announces **"Changes discarded"** (`settings.js:171-184`). A success message for an operation that did not happen.
3. **The Appearance theme-picker cards are broken by `settings.js` itself.** Lines 289-294 attach capture-phase `stopPropagation()` click listeners to every `.theme-option`; theme application lives in `theme.js` `bindPickerCards()` as a **bubble-phase delegated** listener on `document`. The event dies at the card, so Dusk/Dawn/System never apply. The guard is also pointless: dirty-tracking listens to `change`/`input`, which a `<button>` never fires. Only the topbar toggle works — the one feature the notice claims works is broken in its own pane.
4. **Silently dead controls:** the "Transfer workspace ownership" danger button (no `data-danger`, not even the confirm/"Not performed" path), 2FA "Manage", SSO "Configure", the webhook "Add event" button, all six integration "Manage"/"Connect" buttons, and the topbar "Search settings…" input — no handler exists anywhere in the codebase (`globalSearch` appears once, in the ⌘K focus shortcut at `app.js:819`); typing in it does nothing.
5. **A save race:** `serverBacked` starts `null` and `saveChanges` only short-circuits on `=== false` (`settings.js:148-152`); an edit+Save inside the GET window fires `PUT /api/settings` → 404 → a generic "Network Error" toast — exactly what the silent-GET design exists to avoid. `state.isLoading` is written but never read.

**Fabricated capability claims** (AGENTS.md red lines: "No capability claimed without server behaviour", "Never fabricate a metric/affordance"). The quota panel and API-keys section were already cleaned for exactly this reason; the rest of the page was not:

- **Security pane:** a "Two-factor authentication — **Enabled**" badge (the application has *no authentication at all* — ADR-003), an "Encryption at rest — AES-256" switch checked and disabled (nothing encrypts), a "Virus scanning — ClamAV" switch checked (no scanner), a session-timeout select (no sessions).
- **Integrations pane:** Google Drive "**Connected**", Dropbox "**Connected**", Slack "**Notifications on**" — fabricated connection state.
- **Danger zone:** "Empty trash" (**no trash exists** — deletion is permanent by design), "Revoke all API keys" (**self-contradictory**: the API Keys pane on the same page truthfully says none exist), "Delete workspace" / "Transfer ownership" (no workspace or account primitives; an unauthenticated destroy-everything endpoint would be a security red line).
- **Webhooks, Notifications, Storage retention, General toggles:** an event system, five notification channels, a weekly `/temp` purge scheduler, auto-organize, auto-thumbnails and deduplication — none implemented; the "Linux disk" danger-zone copy is wrong on this cross-platform app.

**Collateral doc bug:** `docs/CONTRACTS.md:574` lists `app.js → GET /user/profile, GET /storage/quota` as known gaps — stale; `loadGlobalData()` calls only `/health` and `/dashboard/summary`, both live. Stale docs are bugs per AGENTS.md.

## What Changes

- **Add a real settings backend.** `SettingsService` (instance singleton modelled on `MetadataService`: JSON file at `data/settings.json`, in-memory cache, atomic temp-file-then-rename writes, shipped defaults) behind `src/routes/settings.routes.js` → `src/controllers/settings.controller.js`, with `validateSettingsPayload` in `src/utils/validators.js` (whitelist, type/enum/length checks, `validateClientPath` for the folder). `GET /api/settings` returns a **bare** object (read-only precedent); `PUT /api/settings` is a full validated replace returning the **envelope** `{ success: true, settings }`. Mounted **before** the `/api` catch-all. **JSON over XML**: the repo's persistence convention is JSON-via-singleton; XML would add a parser dependency for no gain. There is deliberately **no** `POST /settings/action` — the danger actions it served are removed, not re-implemented.
- **Repair the form contract.** Every surviving control gets a `name` attribute matching its settings key; `extractPayload` covers every surviving control; Discard re-hydrates from the last server config (or resets to HTML defaults with honest "Edits cleared — nothing was saved" copy when no store answers); the `.theme-option` `stopPropagation` block is deleted; Save is gated on `serverBacked === true` (`null` → "still loading" toast); segmented controls mark dirty only on an actual change; "Linux disk" copy is corrected.
- **Persist only what has a real effect; remove the rest.** The surviving settings are: `general.workspaceName` (consumed by the sidebar brand text at runtime — static sidebar markup untouched), `general.defaultUploadFolder` (validated and persisted; **its `uploads.js` consumer is deferred**, see below), `appearance.defaultView` (consumed by `files.js` as the initial list/grid view), and the theme picker (browser-local, as today). Everything else is removed or replaced with an explicit unavailable note, following the quota-panel/API-keys precedent: the Security, Integrations, Webhooks, Notifications and Storage-retention groups, all four danger-zone actions, the dead topbar search on this page, and the General pane's auto-organize / auto-thumbnails / deduplication switches. Full inventory in `design.md` D2.
- **One consumer deferred:** `uploads.js` reading `general.defaultUploadFolder` is gated on the in-flight `upload-pipeline-correctness` change archiving (it owns that file). The key is stored and validated; the page states plainly that no page applies it yet, so no fabricated claim ships with it.
- **Update the page's honest-broker copy.** The notice is reworded: settings *are* stored server-side now; only the theme remains browser-local. The notice appears only when the store genuinely cannot be reached.
- **Regression coverage and docs.** New `test/services/settingsService.test.js`, `test/api/settings.contract.test.js` and `test/frontend/settings.test.js`; extensions to the live-server fabrication scan; `docs/CONTRACTS.md` (new endpoints, removed-claims inventory, stale `app.js` gap entry fixed), `docs/REPO_MAP.md`, and **ADR-006** recording the JSON-store decision and the persist-only-what-works scope rule.

### Preserved, not changed

- The layered flow `routes → controllers → services → fs` and the `PathService` boundary: the settings store never resolves a client path to disk; `defaultUploadFolder` is only *validated* (`validateClientPath`) and is resolved by `PathService.resolveSecurePath` at the point of use (upload), like every other client path.
- The response-envelope convention (AGENTS.md rule 6): bare read, enveloped mutation, `{ success: false, error }` from `errorHandler` only.
- `MetadataService` and `data/metadata.json` are untouched — settings are a separate store, not new keys in metadata.
- The theme stays browser-local in `localStorage` (`theme.js` owns it); this change only stops `settings.js` from breaking it.
- No authentication is introduced (ADR-003 stands); no destructive server action of any kind is added — the danger zone returns only when designed alongside auth.
- The sidebar markup in all four pages stays byte-for-byte identical (test-pinned); `workspaceName` is applied at runtime by shared chrome, not by editing the markup.
- The topbar notification bell and `notif-dot` are **not** touched — they belong to the in-flight `notification-panel-and-tooltip-placement` change.
- `public/assets/js/api.js` is not modified. `files.js` receives one narrow, additive consumer edit and no behavioural change otherwise; `uploads.js` is untouched because its consumer is deferred behind `upload-pipeline-correctness`.

## Capabilities

### New Capabilities

- `settings-store` — the `SettingsService` persistence contract (JSON file, atomic writes, defaults, corrupt-store behaviour), payload validation, the `GET`/`PUT /api/settings` HTTP contract (envelope shapes, mount order, error semantics), and the deliberate absence of a danger-action endpoint.
- `settings-form-integrity` — the name-attribute contract between markup and module, hydration/extraction coverage, dirty-tracking rules, save gating on store reachability, truthful discard, leave-guards, and non-interference with the delegated theme picker.
- `settings-truthful-ui` — removal of every control, toggle, badge, status and action whose capability does not exist; the unavailable-note pattern for removed groups; the corrected notice copy; escape hygiene for any remaining interpolation.
- `settings-consumers` — the observable effects of the surviving settings outside the Settings page: sidebar brand text, uploads default destination, files default view; each consumer's fallback when the store is unreachable.
- `settings-regression-coverage` — the service/contract/frontend test suites, the extended fabrication scan, and the docs/ADR synchronization.

### Modified Capabilities

None. (`cross-platform-contract` is Dashboard-scoped; the "Linux disk" fix is a copy correction inside `settings-truthful-ui`, not a change to that spec's requirements.)

## Impact

**New files**
- `src/services/SettingsService.js`, `src/routes/settings.routes.js`, `src/controllers/settings.controller.js`
- `test/services/settingsService.test.js`, `test/api/settings.contract.test.js`, `test/frontend/settings.test.js`
- `docs/decisions/ADR-006-settings-store-and-scope.md`

**Modified files**
- `public/assets/js/settings.js` (the large majority of the frontend change), `public/settings.html`, possibly `public/assets/css/settings.css` (unavailable-note styling, if not already covered)
- `server.js` (one mount line, before the catch-all)
- `src/utils/validators.js` (`validateSettingsPayload` only)
- `public/assets/js/app.js` (runtime brand-text seam in shared chrome), `public/assets/js/files.js` (default view) — one narrow edit each. `public/assets/js/uploads.js` was **not** modified: its `defaultUploadFolder` consumer is deferred behind `upload-pipeline-correctness` (see *Preserved, not changed* / *Impact*).
- `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `AGENTS.md` (settings line in the gaps list)
- `test/integration/live-server.test.js` (extended fabrication scan)

**Untouched:** `src/services/MetadataService.js`, `src/services/PathService.js` (consumed, not modified), `src/controllers/fs.controller.js`, `src/routes/fs.routes.js`, `src/routes/dashboard.routes.js`, `public/assets/js/api.js`, `public/assets/js/theme.js`, `public/assets/js/router.js`, all sidebar markup, the topbar notification bell.

### Concurrent-change coordination

- **`upload-pipeline-correctness`** (107/109 tasks, in progress) owns `uploads.js` as "the large majority of this change". This change's `uploads.js` edit (default destination) is therefore **sequenced last**, after that change archives, and is deliberately one additive read (fetch settings → prefill destination) rather than a refactor of queue logic.
- **`notification-panel-and-tooltip-placement`** (scaffolded, no proposal yet) owns the topbar notification surface by name; this change does not touch the bell, `notif-dot`, or tooltips.
- **`files-page-correctness`** is complete (87/87); `files.js` is stable and safe for the one default-view edit.
- **Merge-conflict hotspots:** `server.js` mount ordering (single added line, immediately before the `/api` catch-all, after `/api/dashboard`); `docs/CONTRACTS.md` "Known gaps" section (rewritten here, including removal of the stale `app.js` entry).

**Cross-platform:** the store path resolves from `process.cwd()` exactly like `MetadataService` (tests redirect it to a temp file); no platform-specific behaviour is introduced; the "Linux disk" copy removal deletes the page's only platform assumption.

**Non-goals** (enumerated in `design.md`): authentication, API keys, webhooks, integrations, notifications, trash/recycle, workspace ownership, i18n, timezone-aware rendering, density/reduce-motion hooks (removed unless CSS support is verified), and any `POST /api/settings/action`.

## Acceptance Criteria

Each criterion is independently verifiable. Confirmed defects are marked **[reproduced]**.

### Store and API
- [ ] `GET /api/settings` returns `200` with a bare JSON object matching the documented default shape on a fresh store, and the persisted document after a `PUT`.
- [ ] `PUT /api/settings` with a valid full payload returns `{ success: true, settings }`, writes `data/settings.json` atomically (temp file + rename), and a subsequent `GET` reflects it.
- [ ] `PUT` with an unknown top-level or nested key, a wrong type, an out-of-enum value, or an over-long string returns `400 { success: false, error }` and leaves the store byte-identical.
- [ ] `PUT` with a `defaultUploadFolder` failing `validateClientPath` (traversal, absolute OS path, illegal characters) returns `400`; the path is never resolved to disk by the settings layer.
- [ ] `POST /api/settings/action` (and any other `/api/settings/*`) returns `404` from the catch-all; no danger endpoint exists.
- [ ] The settings router is mounted before the `/api` catch-all (asserted by a contract test that would 404 otherwise).
- [ ] A corrupt `data/settings.json` produces the documented behaviour (service throws → `500` envelope), matching the per-capability decision recorded in `design.md`.
- [ ] No test writes the real `data/settings.json`; every suite redirects `SettingsService.dbPath` to a temp file.

### Form integrity
- [ ] **[reproduced]** Every control the module reads or writes has a `name` attribute in `settings.html`, and every `name` in the markup is covered by hydration and extraction — cross-asserted by a source-level test in both directions.
- [ ] After editing, saving and reloading the page, every surviving control renders the saved value.
- [ ] **[reproduced]** Discard restores every control to the last saved state (or to HTML defaults when no store answers) and its copy never claims a save or restore that did not happen.
- [ ] **[reproduced]** Clicking each theme-picker card applies that theme (asserted by the absence of `stopPropagation` on `.theme-option` and a delegated-handler reachability test).
- [ ] Save clicked while the initial `GET` is in flight never produces a raw network-error toast; the save bar reflects only settings the payload actually covers; clicking an already-active segmented option does not mark dirty.
- [ ] `beforeLeave` still guards unsaved edits on client-side navigation; `beforeunload` guards hard navigation; `destroy()` removes every document/window listener.

### Truthfulness
- [ ] **[reproduced]** The page contains none of: the 2FA "Enabled" badge, AES-256/ClamAV claims, integration "Connected" statuses, webhook tags, notification toggles, retention/auto-purge switches, auto-organize/thumbnail/dedup switches, trash/API-key/ownership/workspace danger actions, or a handlerless search input.
- [ ] Every removed group is either gone or carries an explicit unavailable note; no control renders enabled without a working handler; no status asserts server state that does not exist.
- [ ] The live-server fabrication scan rejects a documented list of settings-specific strings on `/settings.html`.
- [ ] The notice states accurately what is stored (server-side settings + browser-local theme) and appears only when the store is unreachable.
- [ ] The sidebar markup of all four pages remains byte-for-byte identical.

### Consumers
- [ ] With `workspaceName` set, the sidebar brand renders it at runtime on all four pages without any markup edit; with it unset/unreachable, the brand renders the static default.
- [ ] **[deferred — blocked]** The Uploads page opens with `defaultUploadFolder` prefilled as its destination when set, and behaves exactly as today when unset or unreachable. Gated on `upload-pipeline-correctness` archiving; until then the key is stored, validated, and explicitly described as unapplied.
- [ ] The Files page opens in the configured default view when set, and in the current default when unset or unreachable.

### Guardrails and docs
- [ ] `npm test` exits `0` with the new suites included; `docs/CONTRACTS.md` documents both endpoints, the removed-claims inventory, and no longer lists settings (or the stale `app.js` entries) as gaps; `docs/REPO_MAP.md`, `AGENTS.md` and ADR-006 are in sync.
