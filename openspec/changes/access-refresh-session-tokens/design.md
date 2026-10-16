# Design

## Context

See `proposal.md` for motivation. The current state that constrains this approach:

- One credential exists today. `SessionService.login()` mints one 32-byte opaque token
  (`src/utils/crypto.js:32`), stores only its SHA-256 hash, and stamps
  `expires_at = now + 24h` (`src/services/SessionService.js:12,55`). Validation is a single
  indexed query, `WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
  (`src/db/repositories/SessionRepository.js:22-26`), bound to `Date.now()`.
- `authenticate` (`src/middlewares/authenticate.js:41`) reads one cookie (`afm_session`) or one
  bearer token, and is mounted **once** in `src/routes/api.js:64` — after `/auth`, before every
  resource router. `/api/v1` and `/api` run this same assembly, so both prefixes are secured
  identically and a route registered after line 65 is unreachable.
- The CSRF secret lives on the session row (`sessions.csrf_secret`) and is enforced by
  `src/middlewares/csrf.js` for every non-GET request.
- `expires_at` and `last_seen_at` are both on `sessions`; `last_seen_at` is written by `touch()`
  and read by nothing.
- Storage is `node:sqlite`, synchronous, with forward-only integer migrations in
  `src/db/schema.js` (currently at version 5) and all SQL confined to `src/db/repositories/`.
- No runtime dependency may be added: the deployment contract (`docs/DEPLOYMENT.md`, ADR-008) ships
  immutable `git archive` releases built from production dependencies only, and the test suite
  runs hermetically inside each release.

Two hard constraints shape almost every decision below. **First, a refresh happens exactly when
the access credential has already expired**, so the refresh endpoint cannot sit behind
`authenticate`. **Second, tokens are stored hashed**, so the server can never re-emit a token it
previously issued — which turns "return the same successor" into a non-starter.

## Goals / Non-Goals

**Goals:**

- A session that stays usable for up to one year without any single credential living that long.
- Every reuse-detection and revocation decision made by a database read, never by client state.
- No new runtime dependency, no new stored secret to provision, no new trust boundary.
- The browser never holds a script-readable long-lived credential.
- One indexed lookup per authenticated request, as today.

**Non-Goals:**

- Statelesness. Access tokens are *not* self-verifying; they are short-lived so the per-request
  lookup is cheap, not so the lookup can be skipped.
- DPoP on access-token requests. The proof is required at refresh only. Adding it to every API
  call is real client work with no expiry-stolen-token exposure to buy back.
- Pruning expired token rows. Still the open item at `docs-vault/Health/Limitations.md:180`.
- Multi-tenancy, RBAC, policy enforcement, or any change to login lockout policy.
- A "remember this device" flow or any key re-binding. A session's key is immutable for its life.

## Decisions

### D1. The access token stays opaque and database-backed, not a JWT

A short-lived self-contained JWT is the reflexive choice here. Rejected: the existing
`identity/authentication` requirement says a session token "SHALL NOT be a self-describing or
self-verifying credential", and the goal of immediate revocation cannot be met by a token that
carries its own authority — a stateless access token still needs a server-side deny check before
its first use, and once that check exists the signature buys nothing. Keeping the token opaque
means the existing `hashToken` / `findActiveByTokenHash` pattern is reused unchanged and the
access path costs the same single lookup it costs today.

### D2. The token family *is* the session

Rotation chains are modelled as rows in a new `session_tokens` table, each with a `session_id`
and a `parent_id`. No `family_id` column: a family is bounded by its session, so revoking a
family is `UPDATE session_tokens SET revoked_at = ? WHERE session_id = ?`. This also makes the
one-year cap natural — it is a column on the same session row, so no query has to walk the chain
to find the root.

Rejected alternative: one `sessions` row per issued token with a nullable `parent_id` and a
`kind` discriminator. It reuses an existing table but conflates "who is signed in" with "which
credential", destroys the single-place home for `absolute_expires_at` and `csrf_secret`, and
makes every existing session query ambiguous.

### D3. A superseded token inside the grace window re-rotates rather than replaying the same successor

To return the *same* successor token on a retry, the server would have to store that token in a
recoverable form — an encrypt-at-rest key that does not exist in this application and would
become the most sensitive secret in it. Rejected.

Instead, presenting a token that was superseded less than `GRACE_MS` (10 s) ago is accepted as a
fresh rotation and yields a new successor. The client ends up holding a usable token, which is
the entire point of the window: a duplicated or retried request must not fail the user and must
not be mistaken for theft. The token from the lost response is simply never used again.

This is safe *because DPoP is mandatory* (D5): replaying inside the window still requires the
private key, so a stolen refresh token alone gains nothing. If DPoP were ever made optional, this
decision must be revisited — the window would become a genuine 10-second theft window.

### D4. Reuse detection is a timestamp comparison, not a jti ledger

A token row carries `used_at`. `used_at IS NULL` → first use, rotate. `used_at IS NOT NULL AND
now - used_at <= GRACE_MS` → tolerated re-rotation (D3). Otherwise → theft: revoke every token
for that `session_id` and write an audit row with `revoke_reason = 'token_reuse'`. One indexed
read decides it. The `idx_sessions_expires_at` index already present keeps the access-token
lookup cheap; `session_tokens` needs `(session_id)` for family revocation and the `token_hash`
unique index for lookup.

### D5. DPoP: ES256 proof over the request, key pinned on the session at login

The proof is a compact JWS with `typ: dpop+jwt`, `alg: ES256`, the public key inline in the
header `jwk`, and claims `htm`, `htu`, `iat`. The server rebuilds a `crypto.createPublicKey` from
the JWK and calls `crypto.verify`. The client key is generated once with
`crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, false, ['sign','verify'])` — the
public half stays exportable so the JWK can be sent, the private half does not.

Three sub-decisions worth stating:

- **Pin at login, on the session row.** The login body carries the public JWK; the server stores
  `sessions.dpop_thumbprint`. Every refresh resolves token → session and verifies against that
  one column. Pinning at first refresh instead would leave an unbound window and force the column
  onto every token row; pinning at login makes rotation inheritance automatic because there is
  nothing to inherit.
- **Validate the incoming JWK strictly.** `kty === 'EC'`, `crv === 'P-256'`, and a hard reject of
  any private component (`d`). This is untrusted input arriving before authentication.
- **`htu` is bound to the request path, not the full URL.** The app sits behind nginx with
  `X-Forwarded-Proto` (`src/controllers/auth.controller.js:19-23` already depends on it), and
  host/scheme reconstruction is exactly the kind of proxy-dependent value that breaks on a
  deployment change. A path binding is not forgeable in any way that matters here: an attacker
  who can replay a proof to a different endpoint still needs the token and the key.
- **No `jti` replay cache.** A proof grants nothing on its own; it authorises an operation that
  the token row and the key binding already gate. Deduplicating `jti` would add a table and a
  write on the refresh path to defend against nothing.

Rejected alternative: binding the refresh token to the key by storing the thumbprint per token
row — more state, same security, and it needs a "first use binds the key" branch that is a
`NULL` comparison on every refresh forever.

### D6. Two `HttpOnly` cookies, and two of the refresh one, on purpose

`afm_access` is `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` when `req.secure`,
`Max-Age` = access lifetime. The refresh credential goes out as `afm_refresh` with
`SameSite=Strict`.

The refresh cookie is scoped with **two same-named cookies**, one at `Path=/api/v1/auth` and one
at `Path=/api/auth`. This looks redundant and is not: those two prefixes are mutually exclusive,
so a request matches at most one of them and the server never has to disambiguate two cookies of
the same name. It buys a real property — the long-lived credential is not attached to a single
`/fs/list` call — for one `for` loop over the path list.

Rejected alternative: `Path=/api`. One cookie, no cleverness, but RFC 6265 prefix matching means
it rides along on every API call in the application, putting a year-long credential on the wire
for every read. Rejected alternative: `/api/v1/auth` only, leaving the `/api` alias unable to
refresh — the alias is a retained compatibility surface, not something to break.

### D7. `/auth/refresh` and `/auth/logout` sit before `authenticate`, self-gated

This is forced. A refresh is only ever needed once the access token is dead, so putting the
route behind `authenticate` would make it unreachable at exactly the moment it matters — the same
trap `src/routes/api.js:57-59` already carries a comment about for `/auth`.

Both routes self-gate:
- `/auth/refresh` requires the refresh cookie + a valid DPoP proof + a live token row.
- `/auth/logout` accepts the refresh cookie **without** a proof. Revocation never requires proof:
  proving identity in order to destroy access can only ever fail safe. This is what stops a
  long-lived refresh token from surviving logout when the access token has already expired.

CSRF: the refresh cookie is `SameSite=Strict` and path-scoped, which is the CSRF defense for
these two endpoints. `csrf.js` does not run on them (it is mounted at `src/routes/api.js:65`,
after `authenticate`), and must not be duplicated there — a cross-site POST cannot carry a
`SameSite=Strict` cookie at all.

### D8. The frontend renews through a single-flight promise in `api.js`

`api.js` is already the only place that builds a request, so the whole client change is one
retry branch there: on `401`, await a module-level in-flight refresh promise, then replay the
original call once. Single-flight matters because the Uploads page polls and several concurrent
`401`s must produce **one** refresh, not one each — N concurrent refreshes would rotate N times
and could push the newest token out from under the client.

The `DPoP` proof builder is a named export in `api.js` alongside `API.thumbnailUrl`, per the
`api-boundary` guardrail in `test/integration/repo-guardrails.test.js`: page modules must not
assemble an auth header themselves.

The keypair persists in IndexedDB, because `CryptoKey` is structured-cloneable but
`localStorage` cannot hold it. This is load-bearing: a session meant to last a year must survive
page reloads, and a key regenerated on each load has a new thumbprint, which the server would
correctly refuse as a mismatch.

### D9. Placement — where each part belongs

| Part | File | Change |
|---|---|---|
| Token lifetimes, grace window | `src/config/env.js` | `AFM_ACCESS_TTL_SECONDS` (default 900, max 3600), `AFM_REFRESH_TTL_SECONDS` (default 2592000, max 31536000), `AFM_REFRESH_GRACE_SECONDS` (default 10). Out-of-range values fail in `validateStartup()`, alongside the existing `UPLOAD_MAX_BYTES` check |
| Migration 6 | `src/db/schema.js` | `sessions.absolute_expires_at`, `sessions.dpop_thumbprint`; `CREATE TABLE session_tokens` + indexes |
| Token SQL | `src/db/repositories/SessionRepository.js` | `createToken`, `findByTokenHash`, `markUsed`, `revokeSession`, `revokeAllForUser` |
| Issuance / rotation / reuse decision | `src/services/SessionService.js` | `login()` returns a token pair and the thumbprint; new `refresh()`, `revokeByRefreshToken()` |
| Proof verification | `src/utils/crypto.js` | `verifyDpopProof(proof, {method, path, thumbprint, now})` beside the existing `hashToken` / `randomToken` |
| Credential read | `src/middlewares/authenticate.js` | reads `afm_access` or bearer only; a refresh token is refused as a credential by kind |
| Cookies + `refresh` handler | `src/controllers/auth.controller.js` | `setAuthCookies` / `clearAuthCookies` emit both cookies on both auth paths; `refresh()` |
| Route + mount order | `src/routes/auth.routes.js`, `src/routes/api.js` | `/auth/refresh` inside `auth.routes.js`, which is already mounted above `authenticate` |
| Client renewal + proof | `public/assets/js/api.js` | single-flight `refresh()`, replay-once, `dpopProof()` builder, IndexedDB keypair |
| Pruning | — | not in this change |

### D10. API versioning: additive, so no v2

`POST /auth/refresh` is a new endpoint and is additive under ADR-007. `/auth/login`,
`/auth/logout` and `/auth/me` keep their paths and their response shapes — login still returns
`{ success, user, csrfToken }`, `me` still returns `csrfToken`, because `sessions.csrf_secret`
is untouched. This is a change to a security mechanism, not to a resource shape, so it does not
warrant a parallel v2 assembly. The breaking part is confined to the cookie contract, which is
not versioned at all — it is already unrecoverable in practice (an old cookie names a token that
no longer exists in `session_tokens`), and a stale client gets a clean `401` → login redirect.

### Risks / Trade-offs

- **[A client with a live access token cannot revoke it without also presenting the refresh
  cookie]** → `logout` accepts the refresh cookie unproven (D7), so the family is always
  revocable; a client that has lost the refresh cookie has nothing left to protect.
- **[Clearing IndexedDB while keeping cookies locks the user out]** → the thumbprint mismatch is
  refused by design, not worked around; the client falls back to the login page and the user
  re-authenticates. Making it recoverable would mean re-binding a key, which is exactly the
  property DPoP exists to prevent.
- **[The 10 s grace window is a real window for a device-key holder]** → bounded by DPoP
  (the key is required), and documented in design.md as the reason it must not be widened or
  made keyless.
- **[Every authenticated request now joins `session_tokens` to `sessions`** → one extra indexed
  lookup on a path that already performs one; `token_hash` is `UNIQUE`, so the index is a
  direct hit.
- **A token stolen together with the device key defeats rotation and DPoP together** → rotation's
  reuse detection is the backstop: the legitimate client's next refresh is refused and the family
  dies, so the attacker gains one window, not indefinite access.
- **[Reuse is checked before the DPoP proof]** → a stolen *superseded* refresh token can revoke
  its session with no key material. Deliberate availability-over-secrecy trade: a leaked old token
  is itself evidence of compromise, and the attacker gains nothing but a forced re-login.
- **Rolling back to a previous release invalidates all sessions** → old code reads
  `sessions.token_hash`, which the new scheme no longer populates, so every session fails closed.
  Acceptable and safe; call it out in the deploy runbook.
- **[`last_seen_at` becomes even more clearly dead weight]** → leave it; removing it is unrelated
  churn and other consumers may read it.

### Migration Plan

1. Ship migration 6 with the new service methods behind the existing release process. The schema
   change is purely additive: `sessions` keeps `token_hash`/`expires_at` columns (still
   `NOT NULL`, still populated for the lifetime of old rows), so existing sessions are readable
   until they are re-issued.
2. Deploy. On first use after deploy each client re-authenticates once; the browser then holds
   both cookies and the IndexedDB keypair.
3. Verify via `GET /api/v1/health` (`apiVersion` is unchanged, so `scripts/deploy.sh`'s
   `EXPECT_API_VERSION` gate is unaffected) plus the new refresh contract tests.
4. Rollback: revert the release directory and restore the pre-migration `admin.sqlite` from the
   deployment backup. Sessions do not survive the round trip — they fail closed rather than open.