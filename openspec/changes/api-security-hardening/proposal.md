# Proposal

## Why

Phase 1 security discovery found the service is safe as a localhost tool but
**unsafe to expose** to any wider audience: the API is unauthenticated, CORS
admits every origin, the Content-Security-Policy is disabled, the path boundary
is lexical-only (so symlinks and junctions escape the storage root on the
read/download paths), and there is no rate- or resource-limiting anywhere.
The single highest-severity gap — the absence of authentication (ADR-003
follow-up) — is intentionally **split into a separate change**, because it
needs its own ADR and a parallel credential-store design. This change closes
the set of *smaller, independent* exposures that can and should ship before
authentication so the surface is already hardened when auth lands.

## What Changes

- **BREAKING (behavior):** Default CORS is now **disabled** — no
  `Access-Control-Allow-Origin` header is emitted, and no permissive preflight
  is answered. Operators opt in through `AFM_CORS_ENABLED` and a validated
  `AFM_CORS_ALLOWED_ORIGINS` allowlist. Mutating-route behavior is unchanged
  for same-origin callers (the SPA resolves same-origin `/api/v1` already).
- **Symlink containment:** the read/download/preview boundary now rejects
  symlinks and Windows junctions exactly as the tree walk already does, so a
  link inside `STORAGE_ROOT` can no longer be followed to read bytes outside
  the root.
- **Rate limiting:** mutating routes gain per-client rate limits; `trust proxy`
  is configured explicitly against nginx's `X-Forwarded-For`.
- **Upload resource governance:** uploads refuse before staging bytes when
  free space is below a configurable watermark, and excess concurrent / repeated
  uploads from one client are throttled.
- **CSP:** a real Content-Security-Policy is enabled (`default-src 'self'`,
  no `unsafe-inline` for scripts), replacing the disabled policy.
- **Header hardening:** the download `Content-Disposition` legacy `filename=`
  applies `validateFileName` semantics; `GET /api/v1/health` no longer exposes
  `NODE_ENV` to anonymous callers.
- **Store schema:** the metadata store is normalized on read and client paths
  are required to be rooted at `/`, closing the `__proto__`/`constructor` key
  data-quality edge.
- Authentication (the ADR-003 Critical follow-up), CSRF tokens, and the
  settings-credential split are **explicitly out of scope here** and tracked as
  a separate change.

### New Capabilities
- `api-security`: cross-cutting API hardening — CORS posture, rate limiting,
  CSP, upload resource governance, download-header hygiene, and metadata-store
  schema integrity.

### Modified Capabilities
- `filesystem-security`: extend containment to reject symbolic links and
  junctions in every read/download path, matching the existing aggregate-walk
  rule.

## Impact

- Affected code: `server.js` (CORS/CSP/rate-limit wiring),
  `src/config/env.js` (CORS + watermark validation), `PathService.js` /
  `FileSystemService.js` (symlink guard), `src/controllers/fs.controller.js`
  (download header, upload limits), `MetadataService.js` (schema normalize),
  `src/utils/validators.js` (rooted-path + filename rules).
- Positively affected: `/api/v1` **and** `/api` share one assembly
  (`src/routes/api.js`), so every middleware/route change lands on both
  prefixes at once.
- The SPA remains same-origin; no client change is required for CORS/CSP/limits.
- Deployment: `scripts/nginx/dimension.conf` already sends `X-Forwarded-For`;
  the new `AFM_*` variables are added alongside the existing
  `/etc/dimension/dimension.env` contract (ADR-008).
- No new runtime dependency is added; an optional limiter package is the only
  proposed addition and is kept out of the default path when disabled.
