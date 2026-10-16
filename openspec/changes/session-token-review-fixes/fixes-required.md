# Fixes Required: Session Token Review Findings

**Source:** `REVIEW_VERDICT.md`
**Verdict:** APPROVE_WITH_CHANGES
**Created by:** OpenCode
**Date:** 2026-10-16

## Context

`openspec/changes/access-refresh-session-tokens/` replaced the single 24-hour `afm_session`
credential with a short-lived access token and a long-lived, rotating, device-bound refresh token.
All 15 spec requirements were verified as satisfied by real, tested behaviour; both reported
verification commands reproduce exactly (1159/1159 and 72/72, 0 failures); no hidden code changes
and no regressions across changed interfaces.

Four items must land before merge: two stale-document defects **inside files the implementation
report claims to have updated**, one missing hardening measure on a new public endpoint, and one
mislabelled verification section. Four further spec gaps were exposed during review and should be
recorded now so the capability stops under-describing what was built.

This is a standalone fix round, not a full OpenSpec change: it deliberately carries no
`proposal.md`/`specs/`/`design.md`/`tasks.md`, so `openspec validate <name>` will report it as an
incomplete change. That is expected — do not scaffold them.

## Required Fixes

### Fix 1: Remove the stale `findActiveByTokenHash` reference from DATABASE.md

- **File:** `docs/DATABASE.md:125-126`
- **Problem:** The line reads
  `A session is **active** iff revoked_at IS NULL AND expires_at > now (findActiveByTokenHash)`
  **and** its user's `status = 'active'`. `findActiveByTokenHash` was deleted by this change
  (report line 107) and the predicate it describes is no longer how anything is judged. It sits
  three lines below the freshly written `session_tokens` section, which documents the real rule —
  so the document now contradicts itself. AGENTS.md: "stale docs are treated as bugs".
- **Required change:** Replace those two lines with the real predicate, matching the wording already
  used at `docs/DATABASE.md:293-296` ("**Each authenticated request.** …"). It must read
  approximately: a token is usable iff its `session_tokens` row and its `sessions` row are both
  unrevoked, the token is unexpired, the session is before `absolute_expires_at`, `kind = 'access'`,
  and the user is `active` — all judged by `SessionService.validateSession`. Name
  `findByTokenHash`, not `findActiveByTokenHash`.
- **Acceptance criterion:** `grep -n "findActiveByTokenHash" docs/` returns nothing, and
  `grep -n "findByTokenHash" docs/DATABASE.md` returns at least two hits (the stale sentence and
  the repository-operations table).
- **Spec impact:** NO — documentation correction only.

### Fix 2: Restore migration-table row order in DATABASE.md

- **File:** `docs/DATABASE.md:249-250`
- **Problem:** The table now reads `… | 4 | …` then `| 6 | sessions.absolute_expires_at … |` then
  `| 5 | integration_settings … |`. The row for version 6 was inserted above row 5.
- **Required change:** Swap the two rows so the column ascends 1 → 2 → 3 → 4 → 5 → 6. Move the
  File Portal gate warning with row 6 rather than duplicating it.
- **Acceptance criterion:** `sed -n '245,251p' docs/DATABASE.md` shows the `| N |` cells in
  ascending order.
- **Spec impact:** NO — documentation correction only.

### Fix 3: Throttle `POST /auth/refresh`

- **File:** `src/routes/auth.routes.js:40`
- **Problem:** `router.post('/refresh', authController.refresh)` is registered bare, while
  `/login` is wrapped in `loginThrottle`. `/auth/refresh` is reachable with no credential at all
  (`auth.routes.js:59` mounts `/auth` above the blanket `authenticate`), and each call performs an
  indexed DB lookup plus an ECDSA P-256 verify. Neither the spec nor the implementation report's
  risk list mentions the gap.
- **Required change:** Reuse the existing factory — no new mechanism, no new dependency. Add
  `AFM_REFRESH_RATE_LIMIT_PER_MINUTE` (default 30, parsed with the existing `perMinute` helper from
  `src/middlewares/rateLimit.js:39` so `0` disables and an invalid value falls back, matching the
  `AFM_LOGIN_RATE_LIMIT_PER_MINUTE` precedent at `auth.routes.js:37`) and register
  `router.post('/refresh', refreshThrottle, authController.refresh)`. Set `readPerMinute: 0`
  (POST is a write; only the write bucket applies). Add the variable to `.env.example` beside the
  three session-token variables, and document the route's throttle in `docs/CONTRACTS.md` under
  "Auth endpoints". Record the new default in `docs/CONTRACTS.md`'s lifetime-policy area or as a
  one-line note beside the route description.
- **Acceptance criterion:** A contract test in `test/api/auth-refresh.contract.test.js` signs in,
  then exceeds the configured budget with `AFM_REFRESH_RATE_LIMIT_PER_MINUTE` set to a small value
  before `server.js` is required, and asserts a `429` carrying `Retry-After`; a refresh inside the
  budget still returns `200`. Without the env var the default budget must not throttle an ordinary
  session.
- **Spec impact:** **YES** — new requirement; see "Spec Gaps Discovered" Gap A.

### Fix 4: Label the manual verifications as manual in the implementation report

- **File:** `openspec/changes/access-refresh-session-tokens/implementation-report.md:111-172`
- **Problem:** Items 3 and 4 of the `## Verification` section present concrete observed output
  (cookie values, status sequences, a DB row census, a runnable `node -e` one-liner) in the same
  form as the two reproducible commands. Neither is reproducible: they were interactive Chromium
  runs and the `temp/session-verify/` database was deleted afterwards, so the cited one-liner fails
  with `ENOENT`. A reviewer cannot distinguish manual from scripted.
- **Required change:** Retitle item 3 to **"Manual browser verification (not reproducible by a
  reviewer)"**, and add one line under item 4 stating that the database path is recreated by the run
  and does not exist in a clean checkout. Move both under a `### Manual (interactive) — not
  reproducible` subheading, leaving `npm test` and the `node --test` invocation as the only entries
  under `## Verification`. Keep the observed data — it is useful evidence — but label it.
- **Acceptance criterion:** Every command under `## Verification` can be pasted into a shell in a
  clean checkout and run without a manual prerequisite; the manual entries are visibly separated
  and say so in their own heading.
- **Spec impact:** NO — reporting correction only.

## Spec Gaps Discovered

Add all four to `openspec/changes/access-refresh-session-tokens/specs/identity/session-tokens/spec.md`
as `## ADDED Requirements` (or as amended scenarios where noted). Keep each requirement description
under 500 characters and every scenario at exactly four `####` hashtags.

**Gap A — the refresh endpoint is unthrottled in the spec.**
*Proposed requirement:* "The refresh endpoint SHALL be rate-limited per client origin, reusing the
application's existing rate-limiting mechanism rather than a second one, with a stated default
budget overridable by configuration."
*Scenarios:* exceeding the budget yields `429` with `Retry-After`; a refresh inside the budget
succeeds; a throttled refresh response does not disclose whether the presented token was valid.
*Target:* new requirement, `## ADDED Requirements`, spec file as above.

**Gap B — the Secure-cookie scenario is stated in terms the code cannot satisfy.**
The scenario at `spec.md:248` reads "GIVEN the application is running in production WHEN the access
cookie is issued THEN it carries the `Secure` attribute". Implementation keys `Secure` on
`req.secure` (`src/controllers/auth.controller.js:33`), so a production deployment terminating TLS
nowhere near the app (the shipped plain-HTTP nginx config) issues a non-`Secure` cookie. That is
deliberate, pre-existing and documented in the code comment at `auth.controller.js:19-22` — the
*scenario* is the imprecise part.
*Proposed amendment:* restate the scenario as "GIVEN the request arrived over a scheme the server
resolved as secure (directly, or via `X-Forwarded-Proto` from the one trusted proxy hop) WHEN the
cookie is issued THEN it carries `Secure`", and add a scenario asserting a plain-HTTP origin still
receives a working cookie.
*Target:* amend the scenario under **"The Access Credential Is Delivered Only As A Cookie Or Bearer
Header"** (`spec.md:236`).

**Gap C — the grace window's anchor is unspecified.**
The requirement at `spec.md:115` and its scenario at `spec.md:121` say a token "rotated within the
grace window" is tolerated, but never state that the window is measured from the token's *first*
use and is not extended by a retry. The implementation deliberately anchors it
(`src/db/repositories/SessionRepository.js:55-57`, `AND used_at IS NULL`), which has a real
consequence: a retry arriving 11 s after the original refresh destroys the whole session rather than
being tolerated.
*Proposed amendment:* state in the requirement text that the window runs from the token's first use
and that retries within it neither extend the window nor reset it.
*Target:* amend **"A Rotated Refresh Token Is Tolerated Inside A Short Grace Window"** (`spec.md:115`).

**Gap D — transports that cannot observe a 401 are not covered.**
"A Client Renews Transparently Once…" (`spec.md:285`) describes the `fetch` path. The hidden-iframe
and hidden-form download transports (`API.downloadFile`, `API.downloadMultipleFiles`,
`API.downloadZip`) cannot see a response status, so after one access-token lifetime of inactivity
they fail silently until some other call renews. The implementation report flags this; the spec does
not describe it either way.
*Proposed amendment:* add a scenario stating that a download transport, which cannot observe a
`401`, is not renewed by the client and the user must make an API call first — making the known gap
explicit rather than silent.
*Target:* new scenario under **"A Client Renews Transparently Once, Then Falls Back To The Login
Page"** (`spec.md:285`).

## Operational Risks (non-blocking)

**Risk — the File Portal schema gate will refuse this release.** `files-server-web/lib/admin-db.js`
accepts schema ≤ 5; migration 6 makes it refuse `admin.sqlite` until that repo is updated.
*Impact:* deployment blocker for any host running the portal against this database. Outside this
repository.
*Follow-up:* ship the portal gate first, or gate the migration on portal adoption. Already recorded
as Open Question 1 in the implementation report — carry it into the change folder's workflow
follow-ups so it is not lost with the report.

**Risk — plain-HTTP origins cannot renew.** `crypto.subtle` exists only in a secure context, so
behind the plain-HTTP nginx config the browser never sends a `dpopJwk` and the session ends with its
first access token (15 min by default, down from the previous 24 h).
*Impact:* a silent, confusing regression for any operator whose origin is not HTTPS.
*Follow-up:* add a line to the DEPLOYMENT.md pre-flight checklist stating that HTTPS is required for
session renewal. Implement as documentation only — do not add origin detection in this round.

**Risk — grace-window anchoring turns a slow retry into a lost session.** See Gap C. A user who
clicks "retry" more than `AFM_REFRESH_GRACE_SECONDS` (default 10) after the original refresh loses
the whole session.
*Impact:* availability, not security. Defensible, but surprising.
*Follow-up:* consider raising the default to 30 s. **Do not** change the default in this round —
it needs its own decision and the spec amendment in Gap C first.

**Risk — reuse is checked before the proof.** `src/services/SessionService.js:130` runs before
`:139`, so a stolen *superseded* refresh token can revoke a session with no key material.
*Impact:* availability-over-secrecy trade. It matches the requirement and the report discloses the
ordering, but the label is missing from design.md's Risks.
*Follow-up:* add the trade-off to design.md under "Risks / Trade-offs".

**Risk — `htu` is bound to `req.originalUrl`'s path.** Correct while nginx proxies the app at `/`.
*Impact:* mounting under a sub-path breaks every refresh, silently.
*Follow-up:* recorded as Open Question 6. Add a one-line warning to `docs/CONTRACTS.md` beside the
DPoP description.

**Risk — single-flight clears before its awaiters resume.** `api.js` resets `renewing` in `.finally()`,
so a `401` arriving just after a completed refresh starts a second one. Harmless (rotation tolerates
it) and the concurrent-401 test passes.
*Follow-up:* none. Do not "fix" in this round.

## Out of Scope

- **Proactive renewal for download transports** (`downloadFile` / `downloadMultipleFiles` /
  `downloadZip`). Gap D documents the gap; changing the transports is a separate change.
- **Requiring `dpopJwk` at login.** Implementation allows a keyless login so bearer/script clients
  keep working; such a session can never refresh. That is a deliberate, disclosed judgement call
  (implementation report Open Question 3) and stays.
- **Changing the `htu` binding** to a full URL or to a configured external origin.
- **Raising `AFM_REFRESH_GRACE_SECONDS`' default**, or changing the first-use anchoring.
- **Reordering reuse detection after the DPoP check.**
- **The File Portal's `lib/admin-db.js`** — a different repository.
- **The two superseded requirements** (admin-identity's "same token on both transports", saas's
  sliding renewal window). Both remain workflow follow-ups for archive time.
- **Pruning expired `session_tokens` rows** — still the open item at
  `docs-vault/Health/Limitations.md:180`.
- **Any change to the credential logic itself.** Review found no correctness defect in rotation,
  reuse detection, DPoP verification, revocation, or cookie attributes.

## Verification Steps

Run from the repo root, in order.

```bash
# 1. Full suite — expect: tests 1159+ (>= 1160 with the new throttle tests), fail 0, exit 0
npm test

# 2. The touched suites — expect: 0 failures, and the refresh file now reports
#    one more test than the 72 it reported before this round.
node --test test/api/auth-refresh.contract.test.js test/config/env.test.js

# 3. Fix 1 — expect: no output
grep -rn "findActiveByTokenHash" docs/ && echo "FAIL: stale reference remains" || echo "OK: gone"

# 4. Fix 2 — expect: the pipe-separated version cells in ascending order
sed -n '243,251p' docs/DATABASE.md

# 5. Fix 3 — expect: the throttle is registered and the variable is documented
grep -n "refreshThrottle\|AFM_REFRESH_RATE_LIMIT_PER_MINUTE" src/routes/auth.routes.js .env.example docs/CONTRACTS.md

# 6. Fix 4 — expect: only reproducible commands remain under the plain "## Verification" heading
grep -n "^## Verification\|^### Manual\|npm test\|node --test" openspec/changes/access-refresh-session-tokens/implementation-report.md

# 7. Spec gaps — expect: one new requirement plus the amended scenario text
grep -n "rate-limit\|first use\|cannot observe a\|resolved as secure" openspec/changes/access-refresh-session-tokens/specs/identity/session-tokens/spec.md

# 8. No regressions in the shared mechanism — expect: still 0 failures
grep -rn "SESSION_COOKIE\|SESSION_TTL_MS" src/ test/ public/ && echo "FAIL" || echo "OK: none"
```

`openspec validate access-refresh-session-tokens --strict` will fail if the spec additions break the
500-character description rule or a scenario loses its `####` prefix — run it and expect
`is valid`.

## Definition of Done

- [ ] All required fixes applied (Fixes 1-4)
- [ ] Spec updated where flagged (Gaps A-D in
      `openspec/changes/access-refresh-session-tokens/specs/identity/session-tokens/spec.md`);
      `openspec validate access-refresh-session-tokens --strict` passes
- [ ] All verification commands pass
- [ ] Implementation report updated with a new section documenting these fixes — record the throttle
      variable, the DATABASE.md corrections, and the verification relabelling; do not silently edit
      the original Verification claims
- [ ] No new hidden changes — `git diff --numstat 1d140da` lists only files already named in the
      implementation report or in this document
- [ ] The two superseded-requirement follow-ups and the File Portal schema gate (Open Question 1)
      are recorded in the change folder's workflow follow-ups, not only in the report