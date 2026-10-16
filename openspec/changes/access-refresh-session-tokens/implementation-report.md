# Implementation Report — access-refresh-session-tokens

## Fix Round 2

This round responds to the final verdict (APPROVE) and fixes the two non-blocking items. It is
still uncommitted on top of `1d140da`. As in Round 1, the request named `CODE_REVIEW_REPORT.md`,
which does not exist. This file is the report for this change, so the section is here.

### Fix 1: Stale test count in AGENTS.md

`AGENTS.md:31`, before and after:

```diff
-npm test         # ... 1159 tests, exits 0:
+npm test         # ... 1161 tests, exits 0:
```

The number comes from the `npm test` run below, not from the review.

### Fix 2: Duplicate rate-limit parser

In `src/routes/auth.routes.js`, I deleted the local `loginPerMinute` function, which was at former
lines 35-39 with a blank line after it. The login budget now uses the `perMinute` already imported
from `../middlewares/rateLimit` on line 5:

```diff
-function loginPerMinute(raw, fallback) {
-    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
-    const n = Number(raw);
-    return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
-}
-
-const LOGIN_PER_MINUTE = loginPerMinute(process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE, 10);
+const LOGIN_PER_MINUTE = perMinute(process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE, 10);
```

Behaviour does not change: the two functions were byte-identical. `LOGIN_PER_MINUTE` is now at
`auth.routes.js:35`.

### Commands and actual output

```bash
grep -rn "loginPerMinute" src/ test/; echo "grep exit=$?"
```
```
grep exit=1
```
The grep printed no matches. Exit 1 is grep's code for "nothing found".

```bash
npm test
```
```
ℹ tests 1161
ℹ suites 241
ℹ pass 1161
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit=0
```

### Other changes and flags

- `graphify update .` was run after the code change, as AGENTS.md requires. It rewrites files
  under `graphify-out/` only.
- No other edits were made.
- Flag, not fixed: the header comment in `auth.routes.js` still describes
  `AFM_LOGIN_RATE_LIMIT_PER_MINUTE` as "the same override pattern `AFM_RATE_LIMIT_WRITE_PER_MINUTE`
  already uses". The statement remains true. I mention it only because the sharing is now literal,
  since both use one parser.

---

## Fix Round 1

Response to `openspec/changes/session-token-review-fixes/fixes-required.md` (verdict
APPROVE_WITH_CHANGES). Everything below is still **uncommitted** on top of `1d140da`. The original
report further down is unchanged except for the Fix 4 relabelling, which is described here.

**Where this report lives.** You asked for a `CODE_REVIEW_REPORT.md` at the project root. That file
was never created: the first round used this OpenSpec alternative,
`openspec/changes/access-refresh-session-tokens/implementation-report.md`, and the fixes document
calls it "the implementation report". So I put Fix Round 1 here instead of creating a second report
file. A root file would also have been a new path outside both documents, which the "no hidden
changes" rule forbids.

### Fixes applied

| Fix | Applied | How |
|---|---|---|
| 1. Stale `findActiveByTokenHash` in DATABASE.md | Yes | Replaced the sentence at `docs/DATABASE.md:125-128` with the real predicate: `findByTokenHash`, `kind = 'access'`, both rows unrevoked, token unexpired, session before `absolute_expires_at`, user `active`, all judged by `SessionService.validateSession`. |
| 2. Migration table order | Yes | Moved row 6 below row 5. The File Portal warning moved with row 6 and is not duplicated. Rows 1-6 are now at `docs/DATABASE.md:247-252`. |
| 3. Throttle `POST /auth/refresh` | Yes | `src/routes/auth.routes.js`: `REFRESH_PER_MINUTE = perMinute(process.env.AFM_REFRESH_RATE_LIMIT_PER_MINUTE, 30)` and `refreshThrottle = createRateLimit({ writePerMinute: REFRESH_PER_MINUTE, readPerMinute: 0 })`, registered as `router.post('/refresh', refreshThrottle, authController.refresh)`. `perMinute` was module-private, so `src/middlewares/rateLimit.js` now exports it (one added line). The variable is documented in `.env.example` and in `docs/CONTRACTS.md` under `POST /api/auth/refresh`. |
| 4. Label manual verification | Yes | Items 3 and 4 now sit under `### Manual (interactive) — not reproducible`. Item 3 is retitled "Manual browser verification (not reproducible by a reviewer)". The DB one-liner is fenced as `text` and states that `temp/session-verify/data/admin.sqlite` is created by the manual run and absent in a clean checkout. Item 4 carries the same note. The observed data is unchanged. |

**Tests added for Fix 3**

- `test/api/auth-refresh.contract.test.js` sets `AFM_REFRESH_RATE_LIMIT_PER_MINUTE=15` before
  `server.js` is required. The earlier tests in that file make 11 refresh calls, all inside the
  budget. One new test runs last, because it uses up the budget for 127.0.0.1. It checks that:
  - a valid refresh still returns `200`;
  - repeated calls then get `429` with a numeric `Retry-After`;
  - once throttled, a valid token and a bogus token receive the identical `429` body.
- `test/api/auth.contract.test.js` leaves the variable unset (the test asserts that). An ordinary
  session refreshes 10 times in a row, and every call returns `200`.

### Spec gaps

These are all in `specs/identity/session-tokens/spec.md`. Every scenario uses `####`.

| Gap | Change |
|---|---|
| A | New requirement **"The Refresh Endpoint Is Rate-Limited"** (default 30/min, existing mechanism) with three scenarios: over budget → `429` + `Retry-After`; inside the budget succeeds; a throttled response does not disclose token validity. |
| B | The scenario "Production access cookies are marked secure" is replaced by "Access cookies on a secure request are marked secure", where "secure" means the server resolved the scheme as secure, directly or via `X-Forwarded-Proto` from the one trusted hop. New scenario: "A plain-HTTP origin still receives a working cookie". |
| C | The grace-window requirement now says the window runs from the token's first use, and that retries within it neither extend nor reset it. |
| D | New scenario under the client-renewal requirement: "A download transport that cannot observe a 401 is not renewed". |

**Flagged, not in the fixes document:** for Gap C I also added the scenario "A retry does not extend
the grace window". The amended text states a rule, and this scenario is what makes that rule
testable. Remove it if you want the amendment to stay text-only.

### Operational-risk follow-ups (documentation only, as the fixes document directs)

- `docs/DEPLOYMENT.md` pre-flight checklist: new item saying HTTPS is required for session renewal.
- `design.md` → Risks / Trade-offs: new entry saying reuse is checked before the DPoP proof, an
  availability-over-secrecy trade.
- `docs/CONTRACTS.md`: one-line warning that `htu` must match the path the app sees (`req.originalUrl`).
- `tasks.md` → Workflow follow-up: the File Portal schema gate (Open Question 1) is recorded next to
  the two superseded-requirement follow-ups, which were already there.
- The "single-flight clears before awaiters resume" risk: left alone, as the document instructs.

### Verification (commands run, actual output)

Every command below was run from the repo root after all fixes were in place.

```bash
npm test
```
```
ℹ tests 1161
ℹ suites 241
ℹ pass 1161
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit=0
```

```bash
node --test test/api/auth-refresh.contract.test.js test/config/env.test.js
```
```
ℹ tests 32
ℹ pass 32
ℹ fail 0
```
The refresh file alone (`node --test test/api/auth-refresh.contract.test.js`) reports
`tests 14, pass 14, fail 0`; it was 13 before this round. The document's "one more than the 72"
mixes up two runs: 72 was the five-file run in the original report, not this file.

```bash
grep -rn "findActiveByTokenHash" docs/ && echo "FAIL: stale reference remains" || echo "OK: gone"
```
```
OK: gone
```
`grep -n "findByTokenHash" docs/DATABASE.md` → 4 hits (lines 125, 268, 300, 304).

```bash
sed -n '245,252p' docs/DATABASE.md
```
The version column reads `1, 2, 3, 4, 5, 6` in that order. **The document's `sed -n '243,251p'` stops
one row short**, at row 5, because Fix 1 added two lines above the table. The order itself is
correct; use `245,252`.

```bash
grep -n "refreshThrottle\|AFM_REFRESH_RATE_LIMIT_PER_MINUTE" src/routes/auth.routes.js .env.example docs/CONTRACTS.md
```
```
src/routes/auth.routes.js:28: * AFM_REFRESH_RATE_LIMIT_PER_MINUTE (default 30, 0 disables) throttles
src/routes/auth.routes.js:44:const REFRESH_PER_MINUTE = perMinute(process.env.AFM_REFRESH_RATE_LIMIT_PER_MINUTE, 30);
src/routes/auth.routes.js:45:const refreshThrottle = createRateLimit({ writePerMinute: REFRESH_PER_MINUTE, readPerMinute: 0 });
src/routes/auth.routes.js:48:router.post('/refresh', refreshThrottle, authController.refresh);
.env.example:77:# AFM_REFRESH_RATE_LIMIT_PER_MINUTE=30
docs/CONTRACTS.md:324:- Throttled per-IP by its own limiter (`AFM_REFRESH_RATE_LIMIT_PER_MINUTE`, default 30/minute, `0`
```

```bash
grep -n "^## Verification\|^### Manual\|npm test\|node --test" openspec/changes/access-refresh-session-tokens/implementation-report.md
```
Before this section was added, the output was `## Verification`, `npm test`, `node --test …`,
`### Manual (interactive) — not reproducible`. Rerun now, the command also matches the Fix Round 1
lines above, which quote these commands.

```bash
grep -n "rate-limit\|first use\|cannot observe a\|resolved as secure" openspec/changes/access-refresh-session-tokens/specs/identity/session-tokens/spec.md
```
This matched lines 119, 131, 257, 325, 328 and 346, which covers Gaps A-D.

```bash
grep -rn "SESSION_COOKIE\|SESSION_TTL_MS" src/ test/ public/ && echo "FAIL" || echo "OK: none"
```
```
OK: none
```

```bash
openspec validate access-refresh-session-tokens --strict
```
```
Change 'access-refresh-session-tokens' is valid
```

**Hidden-changes check.** I ran `git diff --numstat 1d140da -- . ':!graphify-out'`. The only file
changed this round that the original report did not list is `src/middlewares/rateLimit.js`
(`+1 / −0`). The fixes document names that file (`rateLimit.js:39`). The other files touched this
round were already listed or named:

- `docs/DATABASE.md`, `docs/CONTRACTS.md`, `docs/DEPLOYMENT.md`, `.env.example`
- `src/routes/auth.routes.js`
- `test/api/auth-refresh.contract.test.js`, `test/api/auth.contract.test.js`
- `design.md`, `tasks.md`, `spec.md` and this report

`graphify-out/` changed because I ran `graphify update .`, which AGENTS.md requires after code
changes.

### Fixes I could not apply

None.

### New risks and open questions from this round

- **The refresh throttle is shared by everyone behind one IP**, like the login throttle. Several
  operators behind one NAT share 30 refreshes/minute. At one refresh per access lifetime per client,
  that covers about 450 concurrent clients at the 15-minute default.
- **The throttle test depends on its position in the file.** It must stay last in
  `auth-refresh.contract.test.js` because it exhausts the budget for 127.0.0.1. A comment says so. A
  test added after it will receive `429`.
- **Each auth contract file sends many POSTs from 127.0.0.1**, and all of them count against the
  general `/api` write limiter (60/min). They fit today; adding many more could reach that limit.
- **The verification step 4 line range** in the fixes document is off by two (see above).

---

## Summary

The single 24-hour `afm_session` credential is replaced by two opaque, database-backed tokens: a
short-lived access token (`afm_access`, default 15 min) and a long-lived refresh token
(`afm_refresh`, default 30 d, scoped to the two auth paths). Every refresh rotates, requires a DPoP
proof from a non-extractable device key pinned at login, tolerates a 10 s retry window, and treats
later reuse as theft (whole session revoked). Sessions have a hard 1-year cap that nothing extends.
The SPA renews transparently through one single-flight refresh in `api.js` and replays the call once.
This lets an operator keep a tab open for weeks without any single credential living that long.

Base commit: `1d140da` (branch `feat/refresh-token-session-architecture`). **Nothing is committed** —
every change is in the working tree; reproduce the diff with `git diff 1d140da` plus the untracked
files listed below.

## Files Changed

Line counts are `git diff --numstat 1d140da` (+added / −removed), or `wc -l` for new files.

| File | Status | Lines | Description |
|---|---|---|---|
| `src/config/env.js` | Modified | +39 / −0 | `config.sessionTokens` lifetimes; `validateStartup()` refuses out-of-range values |
| `src/db/schema.js` | Modified | +29 / −0 | Migration 6: `sessions.absolute_expires_at` (backfilled), `sessions.dpop_thumbprint`, `session_tokens` + 2 indexes |
| `src/db/repositories/SessionRepository.js` | Modified | +75 / −13 | `createToken`, `findByTokenHash` (joined), `markUsed`, `transaction`, `revokeSession`, `revokeAllForUser` (cascade to tokens) |
| `src/services/SessionService.js` | Modified | +121 / −34 | `login()` issues a pair + pins key; `validateSession()` access-only; new `refresh()`, `revokeByRefreshToken()` |
| `src/utils/crypto.js` | Modified | +54 / −1 | `publicJwkThumbprint()` (RFC 7638, strict JWK), `verifyDpopProof()` (ES256) — `node:crypto` only |
| `src/middlewares/authenticate.js` | Modified | +13 / −7 | Reads `afm_access` or Bearer; exports cookie names + `readToken` |
| `src/controllers/auth.controller.js` | Modified | +85 / −21 | `setAuthCookies`/`clearAuthCookies` (3 cookies), `refresh` handler, self-gated `logout` |
| `src/routes/auth.routes.js` | Modified | +7 / −3 | `POST /refresh`; `/logout` self-gated (no longer behind `authenticate`) |
| `src/routes/api.js` | Modified | +3 / −3 | Comment only (mount-order rationale) |
| `public/assets/js/api.js` | Modified | +127 / −9 | IndexedDB device key, `dpopProof()`, single-flight `renewSession()`, replay-once on 401, `API.devicePublicJwk` |
| `public/assets/js/login.js` | Modified | +3 / −1 | Sends `dpopJwk` with the login body |
| `test/services/SessionTokenService.test.js` | Added | 223 | DPoP verify, token pair, rotation, grace, reuse → family revoke + audit, revocation cascade |
| `test/api/auth-refresh.contract.test.js` | Added | 213 | Live server: cookie attributes, refresh on `/api/v1` and `/api`, refresh-as-credential 401, logout by refresh cookie |
| `test/frontend/api.test.js` | Added | 145 | Real `api.js` in a vm with Node WebCrypto: 3 concurrent 401s → 1 refresh, replay once, proof verifies server-side, key reuse |
| `test/helpers/dpop.js` | Added | 26 | P-256 key + DPoP proof builder for tests |
| `test/config/env.test.js` | Modified | +21 / −0 | Defaults; out-of-range values named; maxima accepted |
| `test/db/schema.test.js` | Modified | +27 / −0 | Migration 6 columns/table/indexes; legacy backfill |
| `test/services/SessionService.test.js` | Modified | +5 / −5 | `token` → `accessToken` |
| `test/api/auth.contract.test.js` | Modified | +2 / −2 | `afm_session` → `afm_access` |
| `test/api/admin.contract.test.js` | Modified | +1 / −1 | `afm_session` → `afm_access` |
| `test/helpers/authenticated.js` | Modified | +1 / −1 | `afm_session` → `afm_access` |
| `test/frontend/api-boundary.test.js` | Modified | +3 / −2 | Public API surface now includes `devicePublicJwk` |
| `docs/CONTRACTS.md` | Modified | +95 / −23 | Two credentials, lifetime policy table, `POST /auth/refresh`, new login/logout behaviour |
| `docs/DATABASE.md` | Modified | +49 / −10 | Migration 6, `session_tokens` table, repository ops, lifecycle, portal gate warning |
| `docs/DEPLOYMENT.md` | Modified | +6 / −0 | Rollback across migration 6 needs the pre-deploy `admin.sqlite`; all sessions invalidated |
| `docs/REPO_MAP.md` | Modified | +10 / −5 | New tests/helpers, updated service/crypto/routes lines |
| `AGENTS.md` | Modified | +13 / −4 | ADR-009 auth paragraph rewritten with the lifetime policy; test count 1051 → 1159 |
| `.env.example` | Modified | +10 / −0 | The three new optional variables |
| `openspec/changes/access-refresh-session-tokens/tasks.md` | Modified | 28 boxes | All tasks ticked |

`graphify-out/cache/last_query_stamp` was already dirty before this change; `graphify update .` was
run afterwards.

## Change Details

### Added

- **`session_tokens` table (migration 6)** — `id, session_id, kind ('access'|'refresh'), token_hash
  UNIQUE, parent_id, issued_at, expires_at, used_at, revoked_at, revoke_reason`; indexes on
  `session_id` and `expires_at`. The family is the session (no family column).
- **`POST /api/v1/auth/refresh`** (and `/api/auth/refresh`) — refresh cookie + `DPoP` header →
  `{ success: true, csrfToken }` + rotated cookies. Every failure is one identical `401`.
- **`verifyDpopProof(proof, { method, path, thumbprint, now })`** — compact JWS, `typ: dpop+jwt`,
  `alg: ES256`, inline JWK whose RFC 7638 thumbprint must equal the session's, `htm`/`htu` (path
  only), `iat` within ±60 s, raw r‖s signature. Never throws.
- **`publicJwkThumbprint(jwk)`** — accepts only `kty: EC`, `crv: P-256`, a valid point, no `d`.
- **Config**: `AFM_ACCESS_TTL_SECONDS` (900, ≤3600), `AFM_REFRESH_TTL_SECONDS` (2592000, ≤31536000),
  `AFM_REFRESH_GRACE_SECONDS` (10, ≤60); absolute cap fixed at 31536000 s.
- **Client**: device keypair (`generateKey`, `extractable: false`) persisted in IndexedDB
  (`afm-dpop`/`keys`/`device`); `dpopProof()`; single-flight `renewSession()`; `API.devicePublicJwk()`.
- **Audit**: reuse writes `audit_logs` `action = 'session.token_reuse'`, `detail = 'token_reuse'`,
  target = session id, no token value.

### Modified

- **Login** accepts optional `dpopJwk`. Present-but-invalid → same `{ ok: false }`/`401` as a bad
  password (checked after the scrypt, so timing is unchanged). Absent → session works but can never
  refresh. In one transaction: session row (cap = now + 1 y, thumbprint) + access + refresh rows,
  each `expires_at = min(now + ttl, cap)`. Response body unchanged (`success, user, csrfToken`).
- **`validateSession`** — one indexed `findByTokenHash` join; requires `kind = 'access'`, live token,
  live session, before cap, active user. A refresh token is refused by kind.
- **Refresh decision order**: lookup → kind/live check → **reuse check** (`used_at` older than grace →
  revoke session `token_reuse` + audit) → DPoP check → active user → transaction (`markUsed` first-use
  only, insert successor pair with `parent_id`). Reuse is checked before the proof on purpose: a
  leaked superseded token is itself the evidence.
- **Cookies** — `afm_access` (`Path=/; HttpOnly; SameSite=Lax; Max-Age=<access ttl>`) and
  `afm_refresh` twice (`Path=/api/v1/auth` and `Path=/api/auth`; `HttpOnly; SameSite=Strict;
  Max-Age=<refresh ttl>`), both `Max-Age` bounded by the time left to the cap; `Secure` when
  `req.secure`. Cleared with `Max-Age=0` on logout.
- **Logout** — self-gated: live access token → CSRF required (unchanged `403`), revoke that session;
  else refresh cookie alone → revoke that family without proof or CSRF; neither → `401`. Both paths
  revoke the session row and every token.
- **Revocation** — `revokeSession(id, reason)` and `revokeAllForUser(userId, reason)` update
  `sessions` and `session_tokens` in one transaction. Existing callers in `users.controller.js`
  (disable, reset password, revoke-sessions, delete) go through `SessionService.revokeAllForUser`,
  so they cascade with no caller change (task 4.4, verified with
  `grep -rn "revokeAllForUser" src`).
- **`api.js` request core** — on `401` (unless `skipAuthRedirect`), await the shared refresh; on
  success replay once with `renewed: true`; a failed renewal or a second `401` clears the CSRF token
  and redirects to `login.html?redirect=<page>`. Uploads are not replayed but a 401 still triggers
  renewal (redirect only if renewal fails).

### Deleted

- `afm_session` cookie and `SESSION_COOKIE` export; `SessionRepository.findActiveByTokenHash` and
  `revoke`; the flat `SESSION_TTL_MS` (24 h) constant. `sessions.token_hash` is still written (it is
  `NOT NULL UNIQUE`) but with the hash of a discarded random value, so nothing resolves through it.

## Verification

All commands run from the repo root on Windows 10 / Node 24 (Git Bash). No lint/build/typecheck
tooling exists in this repo (AGENTS.md), so none was run.

**1. Full suite**

```bash
npm test
```

```
ℹ tests 1159
ℹ suites 239
ℹ pass 1159
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17976.5885
exit=0
```

(Before the change the suite reported 1113 tests at this branch tip; the 46 new tests are in the
files listed above. The first run after the code change, before updating tests, failed exactly the
`afm_session`-dependent suites, the API-surface guardrail and a `kind:` guardrail — all addressed.)

**2. New and extended suites only**

```bash
node --test test/services/SessionTokenService.test.js test/api/auth-refresh.contract.test.js test/frontend/api.test.js test/config/env.test.js test/db/schema.test.js
```

```
ℹ tests 72
ℹ suites 20
ℹ pass 72
ℹ fail 0
```

### Manual (interactive) — not reproducible

_Relabelled in Fix Round 1 (review Fix 4). The two entries below are observations from an
interactive session, not commands a reviewer can rerun; the data is unchanged._

**3. Manual browser verification (not reproducible by a reviewer)** — Chromium in the Claude
desktop pane, isolated stores

Server started with a throwaway `STORAGE_ROOT`/`AFM_DATA_DIR` under `temp/session-verify/`,
`AFM_ACCESS_TTL_SECONDS=5`, and bootstrap credentials `admin` / `verify-admin-password-1` (test-only;
the temporary launch entry was removed afterwards). Observed:

- Signed in through `login.html` → landed on `files.html`; `document.cookie` was `""` (both cookies
  `HttpOnly`).
- After 7 s: `GET /fs/list → 401`, `POST /auth/refresh → 200`, `GET /fs/list → 200` (replayed).
- Reload after expiry: five concurrent requests → `401`, **one** `POST /auth/refresh → 200`, all five
  replayed `200`; still on `files.html` (device key read back from IndexedDB).
- After expiry, `POST /auth/logout` → `{"success":true}` (refresh-cookie path); then
  `POST /auth/refresh → 401` and `GET /fs/list → 401`.
- Database afterwards: 3 access + 3 refresh rows, 2 refresh rows with `used_at`, all 6 revoked with
  `revoke_reason = 'logout'`; session `dpop_thumbprint` set, `absolute_expires_at − created_at =
  31536000000` ms.

DB inspection used during that run. `temp/session-verify/data/admin.sqlite` is created by the manual
run itself and does not exist in a clean checkout, so this fails with `ENOENT` unless the run is
repeated first:

```text
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('temp/session-verify/data/admin.sqlite',{readOnly:true});console.log(db.prepare('SELECT kind, COUNT(*) n, SUM(revoked_at IS NOT NULL) revoked, GROUP_CONCAT(DISTINCT revoke_reason) reasons FROM session_tokens GROUP BY kind').all())"
```

**4. Real stores untouched** — every server-booting suite redirects `AdminDatabase.dbPath`,
`MetadataService.dbPath` to temp files (unchanged pattern); the new contract suite follows it.
This is a code-reading claim, not a command. The `temp/session-verify/` database used in item 3 is
recreated by that manual run and does not exist in a clean checkout.

## Open Questions

1. **File Portal schema gate.** `docs/DATABASE.md` says the portal (`files-server-web`,
   `lib/admin-db.js`) accepts schema ≤ 5. Migration 6 will make the portal refuse this database until
   its gate accepts 6. That repo is outside this change; it must ship first. (Flagged in DATABASE.md.)
2. **Plain-HTTP deployments.** `crypto.subtle` exists only in secure contexts (HTTPS or localhost).
   Behind the plain-HTTP nginx config the browser cannot create a device key, logs in without
   `dpopJwk`, and its session ends with the first access token (15 min, or up to 1 h via
   `AFM_ACCESS_TTL_SECONDS`) — a regression from 24 h. Options: require TLS, or accept it.
3. **Login without a key is allowed.** The spec says the key is bound at session creation; I made it
   optional so Bearer/script clients keep working (they simply cannot refresh). Requiring it would
   break `curl`-style use documented in CONTRACTS.md. Confirm this is the intended reading.
4. **Iframe/form downloads after idle.** Downloads (`API.downloadFile` / `downloadZip`) use hidden
   iframes and cannot see a `401`, so a download started more than one access lifetime after the last
   API call fails silently in the iframe until any API call renews. A proactive renewal (or a
   pre-flight `renewSession()` in those helpers) would fix it; not in this change's spec.
5. **Grace-window maximum.** The spec gives no maximum for `AFM_REFRESH_GRACE_SECONDS`; I chose 60 s,
   since D3 is only safe while the window stays short.
6. **`htu` is compared to `req.originalUrl`'s path.** Correct while nginx proxies the app at `/`; if
   it is ever mounted under a sub-path the client's `pathname` and the server's path will differ and
   every refresh will be refused.
7. **Rollback is worse than the design states.** The design says rollback makes sessions "fail
   closed"; in fact the previous release's `migrate()` refuses to start on a v6 database. DEPLOYMENT.md
   now says to restore the pre-deploy `admin.sqlite` before rolling back.
8. **Superseded requirements** (from `proposal.md`) remain open: the admin-identity "same token on
   both transports" requirement and the saas sliding-window requirement both conflict with this change
   and need reconciling when those changes are archived.

## Related Spec

- Change folder: [`openspec/changes/access-refresh-session-tokens/`](./)
- Spec delta: [`specs/identity/session-tokens/spec.md`](./specs/identity/session-tokens/spec.md)
- Design: [`design.md`](./design.md) · Tasks: [`tasks.md`](./tasks.md) (all 28 ticked)
