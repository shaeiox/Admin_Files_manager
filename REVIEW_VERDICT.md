# Review Verdict

**Reviewer:** OpenCode
**Date:** 2026-10-16
**Spec:** `openspec/changes/access-refresh-session-tokens/specs/identity/session-tokens/spec.md` (15 ADDED requirements)
**Report reviewed:** `openspec/changes/access-refresh-session-tokens/implementation-report.md`

## Verdict

VERDICT: APPROVE  ·  *re-issued after Fix Round 1 — was APPROVE_WITH_CHANGES. See "Fix Round 1
Re-Review" at the foot of this document: all four required fixes and all four spec gaps were applied
and independently verified; 1161/1161 tests pass.*

Every normative requirement in the spec is satisfied by real, tested behaviour — I traced each one
to source and to a test that actually exercises it, not to a tautological assertion. Both reported
verification commands reproduce exactly. The defects I found are documentation drift in two files
the report explicitly claims to have updated, plus one hardening gap the report does not mention.
None is a correctness failure in the credential logic.

## Acceptance Criteria

| Criterion (spec requirement) | Status | Evidence |
|-----------|--------|----------|
| A Session Grants Two Distinct Credentials | PASS | `src/services/SessionService.js:80-94` issues a pair; `:110` refuses a refresh token as an access credential (`row.token_kind !== 'access'`). Contract: `test/api/auth-refresh.contract.test.js:181-188` (both transports 401). Service: `SessionTokenService.test.js:105-109` |
| Access Tokens Short-Lived, Bounded by Config | PASS | `src/config/env.js:28` `[900, 3600]`, `:151-156` `validateStartup` refuses out-of-range naming the variable; `SessionService.js:87` `Math.min(now + ttl, cap)` |
| Refresh Tokens Long-Lived, Bounded by Config | PASS | `src/config/env.js:29` `[2592000, 31536000]`; `SessionService.js:91`. Expired-token refusal covered `SessionTokenService.test.js:136-137` |
| Hard Absolute Expiry Rotation Never Extends | PASS | `src/db/schema.js:182` column, set once at `SessionService.js:69`; cap enforced in `_live` (`SessionService.js:97-100`). Rotation-cannot-move-cap test: `SessionTokenService.test.js:125-131` |
| Every Refresh Use Rotates The Token | PASS | `SessionService.js:144-147` — `markUsed` + successor insert in one `SessionRepository.transaction`; exactly-one-successor asserted at `SessionTokenService.test.js:113-123` |
| Rotated Token Tolerated Inside Grace Window | PASS | `SessionService.js:130` gates on `now - used_at > grace`; falls through to a normal re-rotation. Test asserts a retry yields a *different* usable successor and the family stays intact (`SessionTokenService.test.js:165-174`) |
| Reuse Outside Grace Window Revokes The Family | PASS | `SessionService.js:131-137` revokes + audits `session.token_reuse` before returning `FAILED`. Test asserts every token revoked, newest token dead, audit carries no token value (`SessionTokenService.test.js:176-194`) |
| Refresh Requires A Non-Extractable Device Key Proof | PASS | `src/utils/crypto.js:75-92` `verifyDpopProof`; key pinned at login `SessionService.js:57-59`. Client generates `extractable:false` (`api.js`, asserted `api.test.js:109`). Missing/wrong-key/wrong-path proofs 401 (`auth-refresh.contract.test.js:160-172`) |
| Every Token Opaque, Judged By The Database | PASS | Only `hashToken()` is persisted (`SessionRepository.js:32-38`). `validateSession` joins the session row (`SessionRepository.js:45-53`) — a revoked session kills a live token (`SessionTokenService.test.js:206-211`) |
| Revoking A Session Invalidates Both Token Kinds Immediately | PASS | `SessionRepository.js:79-87` one transaction over `sessions` + all `session_tokens` |
| Disabling A User Revokes Every Session | PASS | `SessionRepository.js:90-100` cascades; `users.controller.js:47,61,74,88` all route through it (verified by grep, task 4.4 truthful) |
| Access Credential Only As Cookie Or Bearer, Never To Script | PASS | `auth.controller.js:28-37` — cookies only, body carries `success/user/csrfToken` (`auth-refresh.contract.test.js:122-127`). **PARTIAL caveat below** on the literal "production ⇒ Secure" scenario |
| Refresh Cookie Scoped To Authentication Endpoints | PASS | `auth.controller.js:15` two mutually-exclusive paths, asserted `auth-refresh.contract.test.js:111-120` |
| Client Renews Transparently Once, Then Falls Back To Login | PASS | `api.js` `renewSession()` single-flight + replay-once (`api.test.js:88-132`, incl. exactly-one-refresh across 3 concurrent 401s) |
| The Token Lifetime Policy Is Stated | PASS | `docs/CONTRACTS.md` "Lifetime policy" table; `AGENTS.md` ADR-009 paragraph; `.env.example` |
| Every failure returns one identical response | PASS | `FAILED` frozen constant (`SessionService.js:19`); six failure modes asserted deep-equal (`SessionTokenService.test.js:133-155`) |

**PARTIAL on "Production access cookies are marked secure".** The implementation keys `Secure` on
`req.secure`, not on production (`auth.controller.js:33`), so a production deployment behind the
plain-HTTP nginx config issues a non-`Secure` cookie. This is the pre-existing, deliberately
documented behaviour carried forward unchanged (see the comment at `auth.controller.js:19-22`), and
CONTRACTS.md states the real rule. The spec scenario is worded imprecisely relative to the code, not
the code relative to intent. Not a defect introduced by this change.

## Verification Results

| Command | Claimed | Actual | Match |
|---------|---------|--------|-------|
| `npm test` | 1159 tests, 0 fail, exit 0 | **1159 tests, 239 suites, 1159 pass, 0 fail, exit 0** (17.2 s) | YES |
| `node --test <5 new/extended files>` | 72 tests, 0 fail | **72 tests, 20 suites, 72 pass, 0 fail** | YES |
| Real-browser manual run (Chromium, temp stores) | 401→refresh→replay, 5 concurrent 401s → 1 refresh, logout via refresh cookie, DB state | Not reproducible by a reviewer (manual interactive session; the temp DB it names was deleted). Behaviour is independently covered by `auth-refresh.contract.test.js` and `api.test.js`, which I ran. | UNVERIFIED (disclosed as manual; substantiated by the suites) |
| DB inspection one-liner | 3+3 tokens, 2 used, all revoked `logout` | Not runnable — `temp/session-verify/` was removed. Equivalent assertions pass in `SessionTokenService.test.js:176-194`. | UNVERIFIED |
| "Before the change the suite reported 1113" | 1113 | Not checked — verifying it would require stashing the implementer's working tree. 1159 − 72(new/extended) is consistent with the stated delta. | UNVERIFIED |
| Line counts per file (`git diff --numstat`) | per-file table | **Every one of the 25 rows matches exactly** | YES |

## Discrepancies

1. **"Real browser" and "DB inspection" are presented in a `## Verification` section with concrete
   observed output, but neither can be reproduced.** They are manual interactive steps. The report
   is honest that this happened, but the section reads as though the commands were run by the
   reviewer. They should be labelled manual.
2. **`docs/DATABASE.md:125` is stale.** `A session is **active** iff revoked_at IS NULL AND expires_at > now (findActiveByTokenHash)` — `findActiveByTokenHash` was deleted by this change (report line 107) and the predicate it describes is no longer how anything is judged. It sits three lines below a freshly written `session_tokens` section that documents the real rule. AGENTS.md: "stale docs are treated as bugs."
3. **Migration table row order is wrong.** `docs/DATABASE.md:249-250` now reads `… | 4 | … | 6 | … | 5 | …`. Row 6 was inserted before row 5.
4. **`/auth/refresh` has no rate limit.** `src/routes/auth.routes.js:40` registers it bare, while
   `/login` gets `loginThrottle`. Each unauthenticated call performs a DB lookup plus an ECDSA
   verify. Not in the spec, not in the report's risks — an omission rather than a false claim.

## Hidden Changes

**None in application code.** All 24 modified tracked files and all 4 new files appear in the report
table, and nothing else under `src/`, `test/`, `public/`, or `docs/` was touched.

Disclosed non-code churn, consistent with the report's note:
- `graphify-out/**` — 10 modified files + 7 new AST cache files. The report states `last_query_stamp`
  was already dirty before this change; I confirmed that from my own earlier `git status` on this
  branch, and `graphify update .` explains the rest.
- `.opencode/opencode-loop/` — untracked, an editor-agent scratch directory, not the implementer's.
- `openspec/changes/access-refresh-session-tokens/` — untracked as a whole; `tasks.md` (28 boxes
  ticked) is reported.

## Regressions / Risks

**Interface changes — all call sites updated, verified by grep:**
- `SESSION_COOKIE` → `ACCESS_COOKIE`/`REFRESH_COOKIE`; `readToken` newly exported. No stale
  reference anywhere in `src/` or `test/`.
- `SessionRepository.findActiveByTokenHash` / `.revoke` removed. No caller remains.
- `SessionService.login()` return `token` → `accessToken`. Updated in `auth.controller.js:66` and
  `test/services/SessionService.test.js` (4 sites).
- `req.session` now carries the *joined token+session* row, not a bare session row. Every consumer
  (`csrf.js:23` → `csrf_secret`, `auth.controller.js:121` → `id`, `:151` → `csrf_secret`) reads a
  `sessions.*` column, which `s.*` still supplies. `row.id` is the session id — load-bearing for
  whole-family revocation, and confirmed by the passing reuse test rather than by inspection alone.
- `API` gained `devicePublicJwk`; `api-boundary.test.js` updated in the same change.

**Risks (all non-blocking):**
- **Download after idle.** `downloadFile`/`downloadZip` use hidden iframe/form transports that cannot
  observe a 401. After one access-token lifetime of inactivity they fail silently until some other
  API call renews. Against the previous 24 h cookie this is a real UX regression. The report flags it
  (Open Question 4) but it is not in `design.md`'s risk list, and it is the most likely thing a user
  will hit.
- **Plain-HTTP origins cannot renew.** `crypto.subtle` needs a secure context, so behind the
  plain-HTTP nginx config the session ends with its first access token (15 min). Report Open
  Question 2 — worth a line in DEPLOYMENT.md's pre-flight rather than only in a report.
- **Grace-window anchoring has a sharp edge.** `markUsed` stamps first use only
  (`SessionRepository.js:57`), so the window is anchored to the *first* rotation. An ordinary retry
  arriving 11 s after the original refresh — a user clicking "retry", not an attacker — kills the
  whole session. Defensible and deliberate (the comment says so), but the consequence is not stated
  in design.md's Risks, and a 10 s default is tight.
- **Reuse is checked before the proof** (`SessionService.js:130` before `:139`). This means a stolen
  *superseded* refresh token can revoke a session without any key material. That matches the
  requirement ("if a revoked refresh token is used again, the entire session must be revoked
  immediately") and the report discloses the ordering, but it is a deliberate availability-over-
  secrecy trade that deserves the label.
- **`htu` is bound to `req.originalUrl`'s path.** Mounting the app under a sub-path breaks every
  refresh. Report Open Question 6.

## Required Fixes (if REVISE)

N/A — APPROVE_WITH_CHANGES. The four items below should land before merge; none blocks review of
the credential logic.

## Notes

- **The tests are genuinely good, and that is the headline.** `test/frontend/api.test.js` runs the
  real `api.js` in a `vm` against a fake IndexedDB and then validates the proof the client produced
  using the *server's own* `verifyDpopProof` from `src/utils/crypto.js`. That closes the loop between
  two independently written implementations of the same wire format, which is the failure mode most
  likely to survive a green suite here. `test/api/auth-refresh.contract.test.js` exercises both
  `/api/v1` and the `/api` alias as ADR-007 requires.
- Fix `docs/DATABASE.md:125` and the 6/5 row order at `:249-250` — both are in a file the report
  claims to have updated, and both are the "stale docs are bugs" class AGENTS.md calls out.
- Add a throttle to `POST /auth/refresh`, or record in design.md why it does not need one.
- Open Questions 1, 7 and 8 are correct and should be carried into the change folder rather than
  living only in a report: the File Portal's schema gate will refuse a v6 database until
  `files-server-web/lib/admin-db.js` accepts 6, which is a deployment blocker outside this repo.
- The two superseded requirements (admin-identity's "same token on both transports", saas's sliding
  renewal window) are correctly identified in `proposal.md` and carried as workflow follow-ups.
  Neither change is archived, so nothing is inconsistent in-tree yet — but both must be reconciled
  at archive time, or two live specs will contradict each other.
---

## Fix Round 1 Re-Review

**Re-reviewed:** 2026-10-16 · **Source:** `openspec/changes/session-token-review-fixes/fixes-required.md`
**Implementation response:** `openspec/changes/access-refresh-session-tokens/implementation-report.md` → `## Fix Round 1` (lines 3-171)

### Verdict

VERDICT: APPROVE

All four required fixes are applied and verified against source, not against the report's own
claims. All four spec gaps landed and `openspec validate access-refresh-session-tokens --strict`
passes. Two minor items remain open; neither blocks merge.

### Test evidence

| Run | Claimed | Actual | Match |
|-----|---------|--------|-------|
| `npm test` | 1161 tests, 0 fail, exit 0 | **1161 tests, 241 suites, 1161 pass, 0 fail, exit 0** (19.0 s) | YES |
| `node --test test/api/auth-refresh.contract.test.js` | 14 tests, 14 pass, 0 fail | **14 tests, 6 suites, 14 pass, 0 fail** (was 13 before the round) | YES |

### Required fixes

| Fix | Status | Evidence |
|-----|--------|----------|
| 1. Stale `findActiveByTokenHash` | APPLIED | `grep -rn "findActiveByTokenHash" docs/` → no output. `docs/DATABASE.md:125-128` now states the real predicate (`findByTokenHash`, `kind = 'access'`, both rows unrevoked, token unexpired, session before the cap, user active, judged by `validateSession`) |
| 2. Migration row order | APPLIED | `sed -n '245,253p' docs/DATABASE.md` → version column reads `1, 2, 3, 4, 5, 6`. The File Portal warning moved with row 6 and is not duplicated |
| 3. Throttle `POST /auth/refresh` | APPLIED | `src/routes/auth.routes.js:44-45,48` — `perMinute(process.env.AFM_REFRESH_RATE_LIMIT_PER_MINUTE, 30)`, `refreshThrottle` on the existing factory with `readPerMinute: 0`, registered on the route. `perMinute` exported at `src/middlewares/rateLimit.js:101`. Documented at `.env.example:77` and `docs/CONTRACTS.md:324`. Two real tests: `auth-refresh.contract.test.js:218-242` (in-budget `200` → `429` with numeric `Retry-After`, and a **valid** token vs a **bogus** token get deep-equal `429` bodies — no oracle) and `auth.contract.test.js:234-249` (variable unset, 10 consecutive refreshes all `200`) |
| 4. Manual verification labelled | APPLIED | `implementation-report.md:323` `### Manual (interactive) — not reproducible`; item 3 retitled "Manual browser verification (not reproducible by a reviewer)"; the DB one-liner is fenced `text` and states the path is created by the run and absent in a clean checkout |

### Spec gaps

| Gap | Status | Evidence |
|-----|--------|----------|
| A — refresh endpoint throttled | LANDED | New requirement `The Refresh Endpoint Is Rate-Limited` at `spec.md:344` with three scenarios (`:350`, `:355`, `:360`) |
| B — Secure-cookie scenario imprecise | LANDED | Scenario replaced at `spec.md:255` ("Access cookies on a secure request are marked secure"), new scenario at `:262` ("A plain-HTTP origin still receives a working cookie") |
| C — grace-window anchor unstated | LANDED | Requirement text at `spec.md:115` now states the window runs from first use; new scenario `:129` "A retry does not extend the grace window" (the agent flagged this addition for approval — it is the right call: it makes the amended rule testable) |
| D — transports that cannot observe a 401 | LANDED | New scenario `spec.md:325` under the client-renewal requirement |

`openspec validate access-refresh-session-tokens --strict` → `Change 'access-refresh-session-tokens' is valid`.

### Operational-risk follow-ups

All four documentation-only items landed as directed: `docs/DEPLOYMENT.md:37-39` (HTTPS required for
renewal) and `:336-341` (rollback across migration 6); `design.md:225` (reuse-before-proof as a
deliberate availability-over-secrecy trade); `docs/CONTRACTS.md:326-327` (`htu` must match
`req.originalUrl`); `tasks.md:56` (File Portal schema gate recorded as a deployment blocker). The
single-flight race was correctly left alone.

I verified one of the agent's claims that looked wrong: it reports that all auth POSTs also count
against a general `/api` write limiter, and that `CONTRACTS.md:324-325` says the refresh limiter
applies *in addition to* it. **That claim is correct** — `server.js:86` mounts
`app.use('/api', createRateLimit())`. The middleware lives in `server.js`, not `src/`, which is why
a `src/`-scoped grep misses it.

### Corrections to my own earlier review

- The verdict's first line said "16 ADDED requirements". There are **15**. Corrected at the top of
  this document during the first pass.
- I initially suspected the `## Verification` output block at `implementation-report.md:294-304` had
  been garbled by the fix round (a duplicated `fail 0`, `todo 0` missing). **That was wrong** — it
  was an artifact of my own two overlapping `sed` ranges printed in one command. The block is
  intact, and it is a correct historical record of the round-0 run; the current 1161 figure is
  recorded in the Fix Round 1 section above it.

### Remaining open items (non-blocking)

1. **`AGENTS.md:31` is stale.** It states `1159 tests`; the suite is now **1161**. Round 1 added two
   tests and did not update the count. `AGENTS.md` is the file whose own rule says stale docs are
   bugs, and it is the count a reader trusts first.
2. **`loginPerMinute` in `src/routes/auth.routes.js:35-39` is now a byte-identical duplicate of the
   `perMinute` helper the same file imports at line 5.** Round 1 exported `perMinute` — the exact
   remedy recorded in `docs-vault/Health/Code Review.md:1288` and
   `docs-vault/_state/modules/auth-and-access-control.md:192` ("auth.routes.js copies `perMinute`
   from rateLimit.js") — then applied it only to the new refresh budget and left the old copy. Five
   lines of redundancy in a file that now has the shared helper in scope. Not a defect, but it is
   the duplication the project already wrote down as a defect.
3. **The throttle test is order-dependent.** `auth-refresh.contract.test.js:218` states it must stay
   last because it exhausts the budget for `127.0.0.1`. A comment records this. Acceptable, but a
   future test appended after it will receive `429` and fail confusingly.
