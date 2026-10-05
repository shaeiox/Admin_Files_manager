# Tasks

## 1. Configuration & Validation (env surface)

- [x] 1.1 Add `AFM_CORS_ENABLED`, `AFM_CORS_ALLOWED_ORIGINS`, and `AFM_CORS_ALLOW_WILDCARD` to `src/config/env.js`, parsed once at startup. Verify: `openspec validate` and a unit test asserting unset `AFM_CORS_ENABLED` is `false` and a mal formed allowlist entry yields a `validateStartup()` problem.
- [x] 1.2 Add upload free-space watermark env (`AFM_UPLOAD_FREE_SPACE_BYTES`) with a safe default and startup validation. Verify: a unit test that a non-numeric or negative value reports a problem.
- [x] 1.3 Set `app.set('trust proxy', <nginx hop count>)` in `server.js` as a named constant matching `scripts/nginx/dimension.conf`. Verify: a test asserts keying by forwarded client address at the documented hop.

## 2. CORS Default-Off (server.js)

- [x] 2.1 Build CORS options only when enabled, else do not register `cors()`. Verify: new `test/api/cors.contract.test.js` — default deployment emits no `Access-Control-Allow-Origin` and preflight is not permissive.
- [x] 2.2 Reflect allowed origins and set `Vary: Origin` when enabled; omit for disallowed. Verify: the same test asserts `ACAO: <origin>` + `Vary: Origin` for an allowlisted origin and no header for a non-allowlisted one.
- [x] 2.3 Refuse wildcards in production via `validateStartup`. Verify: a startup-validation test asserts production + `*` is a problem.
- [x] 2.4 Add a repo guardrail that `server.js` never calls `cors()` with empty options. Verify: `test/integration/repo-guardrails.test.js` extended and passing.

## 3. Symlink/Junction Containment (PathService + FileSystemService)

- [x] 3.1 Add a non-following symlink check at the read boundary (`getStats`/`resolveSecurePath`) so outside-target links are refused. Verify: a live-server test placing a symlink inside the root to an outside file asserts `GET /api/fs/download` is 403 and streams no outside bytes.
- [x] 3.2 Apply the same refusal to preview and ZIP paths. Verify: preview request for the same link returns 403 and the ZIP contains no outside-target bytes.
- [x] 3.3 Confirm in-root-target links still resolve, and broken links are refused (not streamed). Verify: the same test asserts a link to an in-root file downloads successfully and a broken link returns a client-error status.
- [x] 3.4 Re-run the existing traversal service/service-path tests unchanged. Verify: `FileSystemService.tree/volume/rename` and `PathService` suites stay green.

## 4. Rate Limiting (middleware)

- [x] 4.1 Register a limiter on mutating routes with a strict per-client allowance. Verify: `test/api/rate-limit.test.js` — a burst of mutating requests yields the configured status while reads continue.
- [x] 4.2 Register a looser limiter on read routes. Verify: read bursts are throttled under a separate, larger allowance.
- [x] 4.3 Add no runtime dependency by default unless an acceptable limiter package is installed; document the choice in the change. Verify: `package.json` note / design reference.

## 5. Upload Resource Governance

- [x] 5.1 Stat free space before multer stages bytes; refuse below the watermark. Verify: a test with a low injected free-space reading asserts no `.upload-*.part` remains and the upload-error envelope is returned.
- [x] 5.2 Throttle concurrent/repeated uploads per client. Verify: a test asserts excess concurrent uploads receive the throttling status.

## 6. CSP + Inline-Script Removal (frontend shells)

- [x] 6.1 Audit the four page shells for inline `<script>` blocks and inline event handlers; remove or externalize them. Verify: a source-level repo guardrail asserts no inline `<script>` and no `on*` attributes in `public/*.html`.
- [x] 6.2 Apply the CSP header in the helmet config (remove `contentSecurityPolicy: false`). Verify: an integration test asserts every document response carries a CSP whose script policy is `'self'` with no `'unsafe-inline'`.
- [x] 6.3 Verify the SPA still boots and navigates (the router swaps pages in place). Verify: the existing navigation/frontend suites remain green.

## 7. Header Hygiene + Health Disclosure

- [x] 7.1 Derive the download legacy `filename=` from `validateFileName` semantics. Verify: a download with a control-char-containing name yields a client-error (not a 500), and a valid download emits both `filename=` and `filename*=`.
- [x] 7.2 Remove `env` from the unauthenticated `GET /api/v1/health` body; keep `apiVersion`. Verify: a test asserts `apiVersion` present and no `env`-equivalent leakage.

## 8. Metadata Service Schema Integrity

- [x] 8.1 Normalize `_read` to the documented shape (missing sections default to empty). Verify: a unit test that a store missing `starred`/`activities` is treated as empty, never `undefined`.
- [x] 8.2 Reject client paths not rooted at `/` in `validateClientPath`. Verify: a test asserting `__proto__`/`constructor` paths return 400 and never reach the store, and `db.downloads` value is always a number or absent.

## 9. Docs & Deployment

- [x] 9.1 Document the new `AFM_*` variables in `docs/DEPLOYMENT.md` and `.env.example`. Verify: docs reference each variable added in task 1.1/1.2.
- [x] 9.2 Update the "security posture — stated limitations" section in `docs/CONTRACTS.md` and ADR-003 to record CORS default-off, rate limiting, CSP, and the symlink read-boundary rule. Verify: the referenced limitations read as resolved/updated, not deleted.
