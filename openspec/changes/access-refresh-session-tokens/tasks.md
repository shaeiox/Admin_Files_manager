# Tasks

## 1. Configuration and persistence

- [x] 1.1 Add `AFM_ACCESS_TTL_SECONDS` (default 900), `AFM_REFRESH_TTL_SECONDS` (default 2592000) and `AFM_REFRESH_GRACE_SECONDS` (default 10) to `src/config/env.js`, and refuse startup in `validateStartup()` when access > 3600 or refresh > 31536000, naming the offending variable — verify with a service test that boots the config with an out-of-range value and asserts the thrown message names it
- [x] 1.2 Add forward-only migration 6 in `src/db/schema.js`: `sessions.absolute_expires_at INTEGER NOT NULL DEFAULT 0`, `sessions.dpop_thumbprint TEXT`, and `session_tokens (id, session_id, kind, token_hash UNIQUE, parent_id, issued_at, expires_at, used_at, revoked_at, revoke_reason)` with indexes on `(session_id)` and `(expires_at)` — verify by asserting `migrate()` is a no-op on re-run and that a fresh database exposes both new columns and the new table
- [x] 1.3 Add token operations to `src/db/repositories/SessionRepository.js`: `createToken`, `findByTokenHash` (joins the parent session), `markUsed`, `revokeSession(sessionId, reason)` and `revokeAllForUser(userId, reason)`, keeping every SQL string inside the repository — verify with repository tests covering insert, lookup-by-hash, and whole-session revocation in one statement
- [x] 1.4 Backfill: give existing `sessions` rows an `absolute_expires_at` equal to their current `expires_at` so no pre-deploy session becomes un-cappable — verify with a test that migrates a database containing a legacy session row and asserts the value is copied, not left at the default

## 2. Issuance and device binding

- [x] 2.1 Add `verifyDpopProof(proof, { method, path, thumbprint, now })` to `src/utils/crypto.js`: parse the compact JWS, reject `alg` other than `ES256` and any header carrying a private component, rebuild the key from the inline `jwk`, assert `htm`/`htu` match and `iat` is within the allowed skew, and `crypto.verify` the signature — verify with unit tests covering a valid proof, a wrong-curve JWK, a tampered signature, an `htu` mismatch, and a stale `iat`
- [x] 2.2 Change `SessionService.login()` to accept the client's public JWK, validate it strictly (`kty === 'EC'`, `crv === 'P-256'`, reject `d`), store its RFC 7638 thumbprint on the session, and issue an access token plus a refresh token as `session_tokens` rows stamped with `absolute_expires_at` — verify with a service test asserting two token rows exist, `sessions.csrf_secret` and the response shape are unchanged, and an invalid JWK yields the same `{ ok: false }` as a bad password
- [x] 2.3 Confirm the login response still carries no credential value — verify with a service test asserting the returned object contains neither the raw access token nor the raw refresh token

## 3. Refresh, rotation and reuse detection

- [x] 3.1 Add `SessionService.refresh({ refreshToken, proof, method, path })` resolving token → session, verifying the proof against `sessions.dpop_thumbprint`, and returning `{ ok: false }` for every failure mode without distinguishing them — verify with service tests for unknown token, expired token, session past `absolute_expires_at`, missing proof, wrong-key proof, and disabled user
- [x] 3.2 On success, mark the presented token used and insert the successor with `parent_id` set to it, both in one transaction — verify with a service test asserting the predecessor's `used_at` is set and exactly one successor exists
- [x] 3.3 Accept a token superseded within `AFM_REFRESH_GRACE_SECONDS` as a tolerated re-rotation rather than reuse — verify with a service test asserting a second presentation inside the window succeeds, issues a usable successor, and leaves the family unrevoked
- [x] 3.4 Treat a token superseded beyond the grace window as theft: revoke every token for that session and record the reason — verify with a service test asserting all refresh tokens for the session are revoked, the newest token can no longer refresh, and an audit row exists with `token_reuse` and no credential value

## 4. Revocation paths

- [x] 4.1 Add `SessionService.revokeByRefreshToken(token)` and wire `auth.controller.logout` to revoke the whole session family, accepting the refresh cookie unproven so an expired access token cannot leave a live refresh token behind — verify with a service test asserting revocation succeeds with no proof and that the resulting row is revoked with a logout reason
- [x] 4.2 Make `validateSession()` refuse when the parent session is revoked or past `absolute_expires_at`, so an access token issued seconds before revocation dies on the next request — verify with a service test asserting a freshly minted access token is refused immediately after its session is revoked
- [x] 4.3 Make the existing disable-user path revoke every session and token for that user — verify with a service test asserting refresh is refused for a disabled user holding an unexpired refresh token, and that the response does not imply the password was wrong
- [x] 4.4 Re-check every other caller of `revokeAllForUser` (admin routes, password change if present) still revokes tokens, not just sessions — verify by grepping `SessionRepository.revokeAllForUser` call sites and asserting each now cascades to `session_tokens`

## 5. Transports

- [x] 5.1 Replace the `afm_session` cookie with `afm_access` (`Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` when `req.secure`, `Max-Age` = access lifetime) in `auth.controller.js` — verify with a contract test asserting each attribute on the login response
- [x] 5.2 Emit the refresh credential as `afm_refresh` with `SameSite=Strict`, once at `Path=/api/v1/auth` and once at `Path=/api/auth`, and clear both on logout — verify with a contract test asserting two `Set-Cookie` headers for `afm_refresh` and that logout emits `Max-Age=0` for both paths
- [x] 5.3 Update `authenticate` to read `afm_access` or `Authorization: Bearer` only, and refuse a token whose `session_tokens.kind` is `refresh` — verify with a contract test presenting a refresh token as the access credential and asserting `401`
- [x] 5.4 Register `POST /auth/refresh` in `src/routes/auth.routes.js` so it stays above the blanket `authenticate` in `src/routes/api.js`, and add a contract test that refresh succeeds with no access cookie at all — verify by asserting a successful refresh on a fresh client
- [x] 5.5 Add contract tests for the whole refresh cycle over both `/api/v1` and the `/api` alias — verify that the same assertions pass against each prefix, per ADR-007

## 6. Client renewal

- [x] 6.1 Add a module-level single-flight refresh promise and a replay-once 401 branch to `public/assets/js/api.js`, falling back to the existing `redirectToLogin()` when renewal fails — verify with a `test/frontend/api.test.js` case where three concurrent `401`s trigger exactly one refresh request
- [x] 6.2 Add the `dpopProof()` builder to `api.js` (not to page modules) and wire it into the refresh call — verify with the `api-boundary` guardrail in `test/integration/repo-guardrails.test.js` still passing
- [x] 6.3 Persist the non-extractable keypair in IndexedDB and reuse it on load, regenerating only when absent — verify with a frontend test asserting the second page load reuses the same key rather than generating a second one
- [x] 6.4 Confirm no page module reads or builds an auth credential itself, and that the login form's wrong-password 401 still shows inline instead of redirecting — verify with the existing `skipAuthRedirect` frontend tests plus a new case for the renewed-then-failed path

## 7. Documentation and guardrails

- [x] 7.1 Document `POST /api/v1/auth/refresh`, both cookie names with their attributes, the new login/`me` behaviour and the error cases in `docs/CONTRACTS.md` — verify each documented field against a live response from the contract tests
- [x] 7.2 Document migration 6 and the `session_tokens` table in `docs/DATABASE.md` — verify the column list matches `src/db/schema.js` exactly
- [x] 7.3 Update the ADR-009 authentication paragraph in `AGENTS.md`, which currently states the cookie-and-bearer single-token contract, and state the lifetime policy (access lifetime, refresh lifetime, absolute cap, grace window, re-authentication point) — verify no surviving sentence still claims one credential or a 24-hour flat expiry
- [x] 7.4 Note in the deploy runbook that a rollback invalidates all sessions, and run the full `npm test` suite — verify the suite exits 0 with the real stores untouched

## Workflow follow-up

- Reconcile `admin-identity-and-access-control`'s "Two Credential Transports Are Accepted For The Same Session" requirement with this capability when that change is archived — the transports no longer carry the same token.
- Revisit `saas-identity-and-tenancy`'s "Session Lifetime Is Bounded And Stated", which requires a sliding renewal window; this change deliberately declines it in favour of a hard cap. The two cannot both land.
- **File Portal schema gate (deployment blocker):** `files-server-web/lib/admin-db.js` accepts admin schema ≤ 5; migration 6 makes the portal refuse `admin.sqlite` until that repository accepts 6. Ship the portal gate first. (Implementation report, Open Question 1.)
- Pruning expired `session_tokens` rows remains open (`docs-vault/Health/Limitations.md:180`) and is deliberately not part of this change.