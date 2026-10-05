# Design

## Context

See proposal.md for motivation. The current middleware chain is
`helmet → cors → express.json → express.urlencoded → morgan → static → routes`
in `server.js`, with one mount (`app.use(['/api/v1', '/api'], apiRoutes)`)
serving the same router instances for both prefixes. The path boundary is
`PathService.resolveSecurePath`, and every read/download path already flows
through `FileSystemService.getStats` → `fs.stat` (which follows links).
Mutating and read routes are not rate-limited, uploads are admitted only by a
per-request byte ceiling, and CSP is disabled. Authentication, CSRF, and a
credential store are deliberately excluded (separate change).

## Goals / Non-Goals

**Goals:**
- Give `/api/v1` and `/api` one hardened behaviour set from a single
  registration point.
- Refuse symlink/junction escapes on every read path, matching the aggregate
  walk's existing policy.
- Fail startup cleanly on malformed security configuration.
- Keep the SPA fully functional with no client change (same-origin
  `/api/v1`; CSP-compatible markup).

**Non-Goals:**
- Authentication, authorization, sessions, CSRF tokens, and any credential
  storage — tracked as their own change per ADR-003.
- Removing the `/api` compatibility alias (blocked on authentication).
- Changing the response envelope or any documented status code for
  legitimate requests.

## Decisions

### D1 — CORS off by default; allowlist behind env validation
`AFM_CORS_ENABLED` defaults to `false`. When false the `cors()` middleware is
not registered, so no `Access-Control-Allow-Origin` header is ever sent and
mutating preflights are not answered. When true, the allowlist is validated in
`config.validateStartup()` (absolute `http:`/`https:` origins only, no `*`,
no path components, no scheme-relative values, duplicates rejected, a count
cap), and `credentials` stays `false`. Wildcards require
`AFM_CORS_ALLOW_WILDCARD=true` and are hard-refused when
`NODE_ENV=production`.
*Alternative considered:* keep `cors()` and merely restrict origins — rejected
because an omitted/empty allowlist must fail closed, and because emitting no
header at all is the only posture that survives an operator never setting the
variable.

### D2 — Symlink guard inside the read boundary, not at each controller
The rule "do not follow a link whose target lies outside the root" is enforced
where the path is already resolved: `FileSystemService.getStats` (used by
list enrichment, download, star, ZIP, and the upload-folder checks) plus the
aggregation walk that already detects links. A containment check on the real
target happens for every read; a link to an in-root target still works. The
check is `lstat`/`realpath`-based rather than `fs.stat`, because `stat`
follows links. The choke-point rule is preserved: controllers stay thin and
never re-implement filesystem access.
*Alternative considered:* `fs.realpath` on every path — rejected on Windows
case-insensitive volumes and for not-yet-existing paths, for the same reason
documented in `PathService`; validation is confined to the already-existing
read target.

### D3 — Rate limiting scoped per route-class, keyed by forwarded client
Mutating routes get a strictly smaller allowance than read routes. The limiter
key is the client address; `app.set('trust proxy', N)` is set to the nginx
hop count documented in `scripts/nginx/dimension.conf` (which already sends
`X-Forwarded-For`). Direct callers bypass the proxy only in dev, where the
documented key is the socket address.
*Alternative considered:* a global limiter — rejected because a burst of reads
would otherwise be indistinguishable from a burst of mutations.

### D4 — Upload resource governance is admission-time, not mid-stream
Free space is stat'd before multer stages bytes; below the watermark the
request is refused with the upload-error envelope and no `.upload-*.part` is
created. Concurrent/repeated upload admission is enforced at the route layer,
not by multer's single-file limit.
*Alternative considered:* checking free space after staging — rejected because
it would first write the very bytes that exhaust the disk.

### D5 — CSP ships with the markup in the same change
The policy is `default-src 'self'; script-src 'self'; style-src 'self'
'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'`.
`unsafe-inline` is tolerated only for styles during the transition; scripts
are strictly external to `'self'` because the SPA is served from the same
origin. This forces removing inline `<script>` blocks from the four page
shells in the same change so the policy is real, not aspirational.
*Alternative considered:* leaving CSP disabled and relying on escaping —
rejected; escaping is currently the only XSS layer, which is unsafe given the
55 `innerHTML` sites.

### D6 — Health discloses the contract version, not the environment
`apiVersion` stays (it is the deploy activation gate in `scripts/deploy.sh`);
`env` is removed from the unauthenticated payload because it leaks
`NODE_ENV`. Deployment observability moves to the systemd journal / release
metadata, not the public liveness endpoint.

### D7 — Metadata store is normalised on read; unrooted paths are invalid
`_read` coerces parsed JSON to the documented shape (`{downloads:{},
starred:[], activities:[]}`), defaulting missing sections to empty. Client
paths that do not start with `/` are rejected by `validateClientPath` before
any store access, closing the `__proto__`/`constructor` key edge and the
non-numeric `downloads` leak into list responses.

### D8 — Header hardening reuses the existing validators
The download `Content-Disposition` legacy `filename=` applies
`validateFileName`-equivalent semantics rather than hand-rolling a new regex,
consistent with the project's "reuse the validators" rule. `filename*=UTF-8''`
remains the authoritative encoded form.

## Risks / Trade-offs

- [Risk] CSP breaks a page that still uses inline markup → every shell's
  markup is audited and inline scripts removed in-D5 before the policy flips.
- [Risk] Symlink guard changes behaviour for operators who legitimately use
  links → only links to targets *inside* the root still serve; an explicit
  error (403) replaces the previous silent follow, preserving a truthful
  refusal.
- [Risk] `trust proxy` hop-count drift from nginx config → the value is a
  single documented constant and a test asserts keying by forwarded address at
  the documented hop.
- [Risk] Rate limiting a single-operator host breaks legitimate polling →
  read routes get a generous allowance; only mutations are throttled tight.
- [Risk] CORS-off default surprises operators who integrated third-party
  front-ends → they must set the allowlist explicitly; deployment docs call
  this out.

## Migration Plan

- Deploy-path: no schema migration. New `AFM_*` variables are added to
  `docs/DEPLOYMENT.md` and `scripts/systemd/dimension.service`'s
  `EnvironmentFile` template. Absent variables keep the safe default
  (CORS off, no wildcard), so a stale env file never widens access.
- Rollback: set `AFM_CORS_ENABLED=false` (default) and remove the rate-limit
  / CSP env overrides; behaviour returns to the prior localhost-friendly
  posture only for same-origin clients.

## Open Questions

- Exact rate-limit numbers (per minute) are operator-tunable; defaults are
  proposed in tasks and can be adjusted without changing the spec.
