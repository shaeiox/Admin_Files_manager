# Proposal

## Why

The repository has never been deployed anywhere. There is no CI, no service definition, no proxy
configuration, no release mechanism, and no operator documentation — and, verified during
inspection, **seven concrete defects that would make a first automated deploy silently damage the
deployment rather than fail loudly.**

The most dangerous class of defect is *silent success*. A tracked `.env` carrying a Windows
`STORAGE_ROOT` satisfies the only boot-time guard in `src/config/env.js` (it tests presence, not
shape), so a Linux release **starts cleanly and then fails on every filesystem operation**. And
because `MetadataService` resolves its store from `process.cwd()` and bootstraps an empty document
when the file is absent, a release directory with its own `data/` **wipes the download counts, stars
and activity log on every deploy** — with no error anywhere.

This must be fixed before the service is reachable from anywhere but localhost, because ADR-003
records authentication as a prerequisite for that, and because ADR-001 commits the project to a
deployment that stays trivially simple. CI/CD is the mechanism that makes the *next* deploy safe;
it is not valuable until the first one is.

## What Changes

- **A deployment artifact contract is defined**: exactly what a release contains, what is excluded
  from it, and that production dependencies are installed from the committed lockfile with dev
  dependencies omitted. No build step is introduced (ADR-001).
- **Runtime configuration becomes an explicit, validated contract.** The environment variables the
  service requires are specified, their delivery is specified as out-of-band (never from a tracked
  file), the precedence between a service-supplied environment and `dotenv` is pinned, and the
  **presence-only `STORAGE_ROOT` guard is widened** to reject a value that cannot be a usable root
  on the running platform.
- **Persistent state is specified as surviving releases and rollbacks.** `data/` and `STORAGE_ROOT`
  are required to live outside the release directory, and the resolution basis that currently makes
  this fragile is pinned by requirement rather than left to operator memory.
- **A release lifecycle is specified**: immutable per-release directories, an atomic switch, a
  single-command rollback, bounded retention, deployment-time validation, and post-deployment
  validation against the existing health endpoint.
- **Graceful shutdown is added to the process.** No signal handler exists today, so every restart
  terminates in-flight uploads and downloads. The handler is specified, and `module.exports = server`
  is preserved so the integration suites that close the listener keep working.
- **A service-supervision contract is specified** for the process manager: working directory,
  environment file, restart policy, stop grace period, the unprivileged service identity, and
  filesystem ownership. `WorkingDirectory` is load-bearing here, not stylistic — it is what makes
  the cwd-relative store resolve to the shared location.
- **An edge-proxy contract is specified**, including the upload-size and timeout limits that a
  default proxy configuration would otherwise impose silently on a service whose own limit is 5 GiB.
- **A CI pipeline is specified** that treats the existing suite as the authoritative gate. The suite
  was verified to be hermetic — 772 tests pass with **no environment variables set at all** — so
  the pipeline requires no service, no fixture and no secret.
- **A CD mechanism is specified together with the credentials it needs and the fact that no
  eligible Git remote currently exists.** The only remote is a bare repository on a Windows drive
  (`E:/GitServer/Admin-Files-Manager-fixed.git`); no hosted remote is configured, so a hosted CI
  service is not currently reachable. This is recorded as a decision with a fallback, not assumed
  away.
- **Node.js is pinned.** No version constraint exists anywhere in the repository today.
- **A production-exposure contract is specified** for network binding, host firewall and TLS
  termination, explicitly *not* closing the authentication gap.
- **Seven blockers are fixed** (see the table below), four of them repository-hygiene defects that
  are live right now on `master`.
- **Operator documentation is added** as a deliverable, because a deployment nobody can operate is
  not a deployment.

Nothing about the API surface changes. No endpoint is added, removed, or reshaped; the versioned
assembly at `src/routes/api.js` and the `/api/v1` + `/api` mount in `server.js` are untouched. No
dependency is added — the guardrail suite asserts the manifest is exactly seven packages, and this
change keeps it at seven.

### Blockers identified during inspection

| # | Blocker | Evidence | Severity |
|---|---|---|---|
| B1 | `.env` is **tracked in git** despite the `.gitignore` rule, committed 4× | `git ls-files --error-unmatch .env` succeeds; commits `30c625d`, `b314810`, `cc5162b`, `736ba7a` | Critical — ships a Windows `STORAGE_ROOT` to a Linux host |
| B2 | **No signal handler.** `SIGTERM`/`SIGINT` unhandled in `server.js` and all of `src/` | grep finds handlers only in test teardown | High — every restart drops in-flight transfers |
| B3 | **`data/` is not persistent across releases.** Store resolves from `process.cwd()` and self-bootstraps when absent | `MetadataService.js:11`, `SettingsService.js:46`, `_init()` at `:29` | Critical — silent metadata reset per deploy |
| B4 | **`STORAGE_ROOT` validation is presence-only** | `src/config/env.js:17` | Critical — boots clean, fails per-request |
| B5 | **Upload limits invert at the proxy.** App limit is 5 GiB (`UploadService.js:57`, read once at load); a default reverse proxy caps at 1 MB | `UploadService.js` vs. proxy defaults | High — fails at the edge with a bare 413 |
| B6 | **No eligible Git remote.** Only remote is a local bare repo on `E:/`; `package.json.repository.url` has also drifted (no `-fixed` suffix) | `git remote -v` | High — a hosted CI service is not currently reachable |
| B7 | **Repository hygiene.** 378 of 471 tracked files are agent artifacts (8.6 MB of 8.6 MB total); `data/metadata.json.corrupt-backup` is tracked and `data/storage/` is not ignored | `git ls-files`; `.gitignore` pattern `data/*.json` does not match `*.json.corrupt-backup` | Medium — pollutes every release artifact |
| B8 | **Line endings and exec bit.** `core.autocrlf=true`, `core.fileMode=false`, no `.gitattributes` | git config; no `.gitattributes` in the repository | High — a CRLF shell script, systemd unit or nginx config fails on Linux with an error that points at the wrong cause |

Two further gaps are recorded but deliberately **not** fixed here: the API is unauthenticated with
`cors()` admitting any origin and CSP disabled (ADR-003, `server.js:15-18`), and there is no
structured logging — `morgan('dev')` writes to stdout only. The first is a prerequisite for public
exposure; the second is an optional improvement.

## Capabilities

### New Capabilities

- `deployment-artifact`: what a release contains and excludes; lockfile-driven production
  dependency installation with dev dependencies omitted; determinism of the installed tree; the
  no-build-step constraint; and the prohibition on shipping repository-hygiene artifacts.
- `runtime-configuration`: the required and optional environment variables; validation of
  `STORAGE_ROOT` beyond presence; delivery of production configuration out-of-band with secrets
  never present in the repository; and the precedence between a service-supplied environment and
  `dotenv`.
- `persistent-state`: the requirement that `data/` and `STORAGE_ROOT` survive releases, rollbacks
  and retention pruning; the resolution basis that makes this true; and the prohibition on any
  mechanism that silently bootstraps an empty store in a fresh release directory.
- `release-lifecycle`: immutable release directories; atomic switching; single-command rollback;
  bounded retention that never removes the active or the previous release; deployment-time
  validation; and post-deployment validation against the existing health endpoint.
- `process-supervision`: graceful shutdown on `SIGTERM`/`SIGINT`; the service-manager contract
  (working directory, environment file, restart policy, stop grace period); the unprivileged service
  identity; filesystem ownership; and log capture.
- `edge-proxy`: reverse-proxy requirements for upload size, request and read timeouts, body
  buffering, forwarded headers, and the prohibition on a second SPA fallback that would shadow the
  application's own.
- `delivery-pipeline`: the CI test gate; Node.js version pinning; the dependency-install step; the
  hermetic-suite requirement; the deployment trigger; deployment credentials; and the Git-remote
  precondition, including the current absence of an eligible remote.
- `production-exposure`: network binding of the application port, host firewall posture, TLS
  termination, and the explicit statement that exposure is blocked on authentication landing first.

### Modified Capabilities

None. `cross-platform-contract`, `storage-semantics` and `filesystem-security` are referenced but
unchanged: this change adds no Dashboard field, alters no capacity computation, and does not touch
the traversal guard, the storage-root deletion prohibition, or the escaping requirement. The
platform-verification requirement introduced here is deliberately **not** added to
`cross-platform-contract`, because that capability governs *response shape* on each platform, while
this change concerns *which platform runs the service* — a different concern, and widening an
archived change's capability would be scope creep.

## Impact

### Code

| File | Change |
|---|---|
| `src/config/env.js` | Validate `STORAGE_ROOT` as a usable root rather than a present string; resolve the store base directory from an explicit variable. |
| `src/services/MetadataService.js`, `src/services/SettingsService.js` | Read the store path from the resolved base directory instead of `process.cwd()` directly. Defaults unchanged, so local development and every existing suite behave identically. |
| `server.js` | Add `SIGTERM`/`SIGINT` handling. `module.exports = server` and the `app.listen(config.port)` signature are preserved so the integration suites keep closing the listener. |
| `.env.example` (new), `.nvmrc` (new) | Documented configuration contract; pinned runtime version. Neither is loaded by the server. |
| `.gitattributes` (new) | Pin line endings for shell, unit and proxy-config files. Without it they arrive CRLF from a Windows working tree and fail to parse on Linux. |
| `.gitignore`, index | Widen the `data/` rules; untrack `.env` and the corrupt store backup. |
| `scripts/deploy.sh` (new), `scripts/trigger-deploy.sh` (new), `scripts/systemd/dimension.service` (new), `scripts/nginx/dimension.conf` (new) | The deployment artifacts, version-controlled so they are reviewable and diffable rather than hand-typed on a host. |
| Hosted CI workflow | Created **only if** an eligible remote is added. No hosted remote exists today; see `design.md` D8. |
| `docs/DEPLOYMENT.md` (new) | Operator runbook: prerequisites, first install, deploy, rollback, troubleshooting. |
| `docs/decisions/ADR-008-production-deployment.md` (new) | The decision record, including why Docker was rejected and why no hosted CI service is assumed. |
| `docs/REPO_MAP.md`, `docs/CONTRACTS.md`, `AGENTS.md` | New files, new operational contract. |

**Four application source files change** (`env.js`, the two stores, `server.js`), all additive:
one variable read, one path join per store, one signal handler. No controller, route, validator,
middleware or frontend module changes, and no request-path behaviour changes.
**No new dependency** — the guardrail suite asserts the manifest is exactly
`archiver, cors, dotenv, express, helmet, morgan, multer` and this change keeps it at seven. The
`npm test` script string is untouched, because a guardrail test asserts its exact form. No test file
is modified.

### Verified current state (measured, not assumed)

| Claim | Measurement |
|---|---|
| Suite health on this commit | `npm test` → **772 tests, 145 suites, 0 fail, ~6.7 s** |
| Suite hermeticity | `env -u STORAGE_ROOT -u PORT -u NODE_ENV npm test` → **772 pass**. Suites set `PORT='0'` (OS-assigned), `DOTENV_CONFIG_QUIET=true`, and `os.tmpdir()` trees |
| Suite isolation | `STORAGE_ROOT`, `MetadataService.dbPath`, `SettingsService.dbPath` + both caches redirected before `server.js` is required |
| Dependency manifest | Exactly 7 prod + 1 dev, asserted **twice** by `test/integration/repo-guardrails.test.js` (lines 31-33, 118) |
| Node version pinned? | **No** — no `engines` field, no `.nvmrc`, no toolchain file |
| Signal handling | **None** in `server.js` or `src/` |
| `STORAGE_ROOT` guard | Presence-only; a Windows path boots successfully on Linux |
| Port binding | `app.listen(config.port)` — no host argument, so the service binds **all interfaces** |
| Health gate available | `GET /api/v1/health` and `GET /api/health`, both reporting `apiVersion: 1` |
| Upload limit | `UPLOAD_MAX_BYTES`, default 5 GiB, read **once at module load** (`UploadService.js:57`) — a restart-only change |
| Repository composition | 471 tracked files: **378 agent artifacts** (8.6 MB) vs. 93 runtime files (1.7 MB) |
| Git remote | `E:/GitServer/Admin-Files-Manager-fixed.git` — local bare repo on a Windows drive; no hosted remote |
| Concurrent change state | `upload-pipeline-correctness` 107/109, **owns `uploads.js`, unarchived**; `settings-page-correctness` 23/25; `api-v1-versioning-and-boundary` 41/42; `files-page-correctness` and `notification-panel-and-tooltip-placement` complete but unarchived |

### Security

This change **narrows** exposure and closes nothing that was open. Untracking `.env` removes a
committed configuration file from history going forward. The proxy, firewall and service-identity
requirements reduce the reachable surface. But the service remains unauthenticated with
`cors()` open to any origin and CSP disabled (`server.js:15-18`); ADR-003 records that as the
blocking prerequisite for public exposure, and `production-exposure` states it as a precondition
rather than pretending this change resolves it.

### Out of scope

Authentication · CORS restriction · CSP · any API endpoint, shape or version · the `/api` alias ·
the file-type taxonomy invariant · the frontend · a Docker or container image · a database · a
bundler or TypeScript · structured logging or a metrics pipeline · multi-host or blue-green
deployment · TLS certificate automation beyond documenting the requirement.