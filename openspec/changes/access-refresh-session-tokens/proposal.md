# Proposal

## Why

Session lifetime today is a single hard 24-hour wall stamped at login (`SESSION_TTL_MS` in
`src/services/SessionService.js:12`) and checked by one SQL predicate on every request
(`src/db/repositories/SessionRepository.js:22-26`). Activity does not extend it — `last_seen_at` is
written by `touch()` and never read. So an operator who leaves a browser tab open is logged out
mid-task every day, and the only way to hold a session longer is to lengthen the TTL for *every*
client, which weakens the short-lived case in exchange.

Long sessions and short sessions are different requirements with different blast radii, and one
number cannot serve both. Separating them lets the *credential that authorizes work* stay short and
cheap to revoke, while the *credential that renews it* stays long and is bound to a device key, so
a stolen long-lived token is not sufficient on its own.

## What Changes

- **BREAKING** The session credential splits into two: a short-lived **access token**
  (15 min default, configurable up to 1 h) that authorizes API calls, and a long-lived **refresh
  token** (default 30 d, configurable up to 1 y) whose only purpose is to mint a new access token.
- **BREAKING** The browser transport changes from one cookie (`afm_session`) to two `HttpOnly`
  cookies: `afm_access` (`Path=/`, `SameSite=Lax`) and `afm_refresh`
  (`Path=/api/v1/auth`, `/api/auth`, `SameSite=Strict`). `afm_session` is retired. Nothing becomes
  readable from JavaScript, so the XSS surface is unchanged — but a JS-level caller can no longer
  read its own credential to reattach it manually.
- **New** `POST /api/v1/auth/refresh` — exchanges a refresh token + device proof for a new access
  token and a new refresh token. `POST /api/v1/auth/logout` additionally revokes the refresh token
  family.
- **New** Mandatory refresh-token **rotation with reuse detection**. Every use issues a new refresh
  token and revokes the predecessor. A ~10 s grace window accepts exactly one replay of the
  predecessor (the concurrent-request / network-retry case). A replay *outside* that window revokes
  the entire token family (session) immediately, on the assumption the token was stolen.
- **New** **DPoP device binding**. Every refresh carries a proof signed by a non-extractable
  ECDSA P-256 key held by the client (`crypto.subtle.generateKey`, `extractable: false`). The server
  stores the public key's JWK thumbprint on the token row and refuses a refresh whose proof does not
  match. Mandatory for every client — there is no non-DPoP refresh path.
- **New** **Hard absolute cap.** `sessions.absolute_expires_at` is stamped once at first login and
  is never extended by rotation. Rotation can outlive the refresh token's own expiry but can never
  push a session past one year.
- **New** **Immediate server-side revocation.** Both token kinds are opaque values backed by
  database rows, never self-describing credentials. Revoking a session (logout, disable, admin
  action) invalidates its access and refresh tokens in the same write; the access-token lookup
  joins the session row, so an in-flight access token dies on the next request rather than living
  out its remaining lifetime.
- **Behaviour change** The CSRF token stays session-bound and header-delivered, unchanged. It is now
  re-minted only at login and carried in the `/auth/me` response as before, so a page reload still
  recovers it without re-authenticating.
- **Unchanged** The `/api` compatibility alias, the `/api/v1` contract, and the additive-only rule
  of ADR-007. `/auth/login`, `/auth/logout` and `/auth/me` keep their paths and response shapes;
  `/auth/refresh` is a new endpoint. This is a security-mechanism change, not a resource-shape
  change, so it does not require a v2 assembly.

### Explicitly not in scope

- Multi-tenancy, RBAC expansion, or any change to file-access policies.
- Rate-limiting / lockout policy (`MAX_FAILED_LOGINS`, `LOCKOUT_MS`) — untouched.
- Pruning expired token rows. The `idx_sessions_expires_at` index already exists; the sweep itself
  stays the open item recorded in `docs-vault/Health/Limitations.md:180`.

## Capabilities

### New Capabilities

- `identity/session-tokens`: the credential lifecycle for a session — access/refresh separation and
  their lifetimes, rotation with reuse detection and its grace window, device binding by proof,
  the hard absolute session cap, opaque database-backed storage, revocation, and the two
  `HttpOnly` browser transports.

### Modified Capabilities

None. `openspec/specs/` contains no identity capability yet, so there is no requirement text to
delta. See "Superseded requirements" below for the two unarchived change-local specs this
contradicts or refines.

## Impact

**Persistence** (`src/db/`) — forward-only migration 6 in `src/db/schema.js`. `sessions` gains
`absolute_expires_at INTEGER NOT NULL` and `dpop_thumbprint TEXT`; new `session_tokens` table
(`id`, `session_id`, `kind`, `token_hash` UNIQUE, `parent_id`, `issued_at`, `expires_at`,
`used_at`, `revoked_at`, `revoke_reason`). The token *family* is the session itself, so there is
no family column — one indexed `DELETE`-style `UPDATE ... WHERE session_id = ?` is a whole-family
revocation. `SessionRepository` gains token operations. No new dependency: `node:crypto` verifies
the key pair and `node:sqlite` stores it.

**Services** (`src/services/SessionService.js`) — `login()` issues a token pair instead of one
token; new `refresh()` and `revokeFamily()`. `validateSession()` resolves an access token against
both its row and its parent session.

**Middleware** (`src/middlewares/authenticate.js`) — reads `afm_access` / `Authorization: Bearer`
only; the refresh token is never accepted as an authentication credential, only at `/auth/refresh`.

**Controllers / routes** (`src/controllers/auth.controller.js`, `src/routes/auth.routes.js`) — new
`refresh` handler; cookie helpers emit both cookies with correct `Path`/`SameSite`. `POST /auth/refresh`
must be registered inside `auth.routes.js` *before* the blanket `authenticate` in `src/routes/api.js:64`,
or it is unreachable by construction — the same trap login already has a comment about.

**Frontend** (`public/assets/js/api.js`) — one 401 branch: try `API.refresh()` once, then replay the
original request; on failure fall back to the existing `redirectToLogin()`. `api.js` also gains the
one place that builds a `DPoP` proof (it must go through a named builder here, not be assembled
inline by page modules). Keypair creation is a one-time `crypto.subtle.generateKey` whose public
JWK is exported once to the server at first refresh and thereafter carried in the token row.

**Tests** — new `test/services/SessionTokenService.test.js` and
`test/api/auth-refresh.contract.test.js`; `test/frontend/api.test.js` gains the 401-refresh-replay
path. Every existing auth contract test that reads `afm_session` must be updated in the same change.

**Docs** — `docs/CONTRACTS.md` (new endpoint, new cookie names, new response fields),
`docs/DATABASE.md` (migration 6, new table), `AGENTS.md` (the ADR-009 authentication paragraph, which
currently documents the cookie-and-bearer single-token contract).

## Superseded requirements (surfaced, not silently decided)

1. **`admin-identity-and-access-control` → "Two Credential Transports Are Accepted For The Same
   Session"** requires the cookie and the bearer header to carry *the same* token resolving to the
   same session. This change makes that untrue by construction: the cookie carries the access token,
   the refresh token is a different credential usable at exactly one endpoint. That requirement is
   implemented in code today (`src/middlewares/authenticate.js:26-30`) and is superseded here.
2. **`saas-identity-and-tenancy` → "Session Lifetime Is Bounded And Stated"** requires an actively
   used session to be *renewed within a sliding window* (`its expiry is renewed`). This change
   deliberately declines that: `absolute_expires_at` is never extended. The two changes are both
   unimplemented-somewhere in flight and cannot both land; this proposal asks for the hard cap, and
   the saas change's sliding-window requirement will need reconciling when it is revived.
3. Neither change's `identity/authentication` capability is archived into `openspec/specs/`, so this
   change opens a separate `identity/session-tokens` capability rather than modifying one. When the
   admin identity change is archived, its session-transport requirements must be reconciled with
   this capability's spec at that time.