# Tasks (§A — the contract endpoints ship before the portal's HTTP source)

## 0. Hygiene

- [ ] 0.1 Remove the stray `~/` folder (VS Code user data) and the root `portal.log` from this working copy, and add `/~/` to `.gitignore`
- [x] 0.2 Remove `PORTAL_ROOT` from the local `.env`
- [x] 0.3 Replace the `D:\Projects\…` path in `test/integration/error-disclosure.test.js` and the `D:\…` / `E:/GitServer/…` references in `docs/` and `package.json` (`repository.url`) with neutral placeholders
- [x] 0.4 `graphify-out/`: confirm it should still be committed (`!graphify-out/`); it must not carry the host-specific `.graphify_python`

## 1. Root isolation (`app-root-isolation`)

- [x] 1.1 `src/config/env.js` `validateStartup`: in production, refuse when `AFM_DATA_DIR` realpath is inside `path.resolve(__dirname, '../..')` (the code folder)
- [x] 1.2 Same function: overlap check between `STORAGE_ROOT` and both the code folder and `AFM_DATA_DIR` (refuse in production, warn otherwise); `realpath` and case folding on win32
- [x] 1.3 Tests in `test/config/`: each scenario of the spec, including symlinked folders and a path with spaces
- [x] 1.4 `scripts/systemd/dimension.service`: confirm `ReadWritePaths` covers only `AFM_DATA_DIR` and `STORAGE_ROOT`; add `ReadOnlyPaths` for the code folder

## 2. Contract endpoints (`portal-integration-contract`)

- [x] 2.1 `src/config/env.js`: parse and validate `AFM_PORTAL_SERVICE_TOKEN` (list, at least 32 characters each, never echoed) and `AFM_PORTAL_URL` (absolute http(s), no path)
- [x] 2.2 `src/middlewares/serviceToken.js`: constant-time Bearer check, own rate-limit bucket, `404` when unset
- [x] 2.3 `src/routes/integration.routes.js`, mounted in `src/routes/api.js` before `authenticate`/`csrf`
- [x] 2.4 `src/services/PortalContractService.js`: snapshot in one read transaction from the existing repositories; `credentialStamp` = domain-separated sha256 of `password_hash` (not keyed by the token, so rotation keeps sessions; see design D4); `sessionsRevokedAt` from `audit_logs` as the portal does today
- [x] 2.5 ETag (sha256 of the canonical JSON), `304`, `Cache-Control: no-store`
- [x] 2.6 Measure the snapshot size and time on the reference database; record the numbers in `design.md`
- [x] 2.7 `credentials/verify`: reuse `UserService` login rules and the login limiter; uniform `401`
- [x] 2.8 Contract fixtures `test/contract/portal-v1/` (snapshot sample and decision cases), byte-identical to the portal's copy; `test/contract/portal-v1.test.js` checks the document for the fixture database is exactly `snapshot.json` (stricter than a schema check) and the local mirror agrees with every case
- [x] 2.9 Tests: each spec scenario (token missing/wrong/rotated/weak, `304`, no `password_hash` anywhere in the body, password change → new stamp, disabled user → `401`)

## 3. Log and access check from the portal

- [x] 3.1 `PortalService.getLog`: use `AFM_PORTAL_URL` when set, otherwise `PORTAL_LOG_FILE` with a one-time deprecation warning; set a timeout and report "not reachable"
- [x] 3.2 `filePolicy.controller.effectiveAccess` (`GET /admin/files/effective`): proxy to `<AFM_PORTAL_URL>/api/ops/access-check`, keeping the response shape; `503` when the portal is unreachable
- [ ] 3.3 After 3.2 ships: delete `portalKey`/`portalAccess` and their tests; keep the contract-fixture test

## 4. Docs and decision record

- [x] 4.1 `docs/decisions/ADR-011-integration-over-http-contract.md` (supersedes ADR-010 decision 1, "share through admin.sqlite")
- [x] 4.2 `docs/CONTRACTS.md`: contract v1 JSON schema, versioning rule, endpoints, token
- [x] 4.3 `docs/DEPLOYMENT.md` and `.env.example`: dedicated storage tree, `AFM_DATA_DIR` outside the release, token and URL, migration table from `design.md`
- [x] 4.4 Runbook: moving `STORAGE_ROOT` with its `.dimension-volume` (never re-stamp)

## 5. CI

- [x] 5.1 Relocation job: copy to `$(mktemp -d)/"relocated app"`, `chmod -R a-w`, run `npm test` and a smoke start of `/api/health`
- [x] 5.2 Relocation lint (sibling repo name, `/opt/devel`, `D:\`, `E:/`, `../` outside dependencies)
- [ ] 5.3 `npm test` passes; `graphify update .`

## 6. Follow-up release (after the portal drops its SQLite source)

- [ ] 6.1 Remove the `PORTAL_LOG_FILE` fallback
- [ ] 6.2 Note in ADR-011 that `admin.sqlite` is now private to this application; tighten file mode to `0600`
