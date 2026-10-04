# ADR-008 — Production Deployment: systemd, Immutable Releases, Host-Side Gate

- **Status:** Accepted (mechanism implemented; first real-host deployment pending)
- **Date:** 2026-10-04
- **Deciders:** Project maintainer
- **Tags:** operations, deployment, ci-cd, configuration, security
- **Change:** `openspec/changes/production-cicd-readiness`
- **Runbook:** `docs/DEPLOYMENT.md`

## Context

The service had never been deployed. Inspection found defects that would have made a first
automated deploy **silently damage** the host rather than fail loudly:

- A tracked `.env` carried a Windows `STORAGE_ROOT`. The only guard checked that the variable was
  **present**, so the service would boot on Linux and then fail on every filesystem call.
- The stores resolved from `process.cwd()` and bootstrap an empty document when the file is absent.
  A per-release working directory would therefore **wipe downloads, stars and activity on every
  deploy**, with no error.
- There was no signal handling, so every restart cut off in-flight transfers.
- The upload limit is 5 GiB, while nginx's default body ceiling is 1 MB.
- No hosted Git remote exists: the only remote is a bare repository on a Windows drive.
- `core.autocrlf=true` with no `.gitattributes` means shell scripts, units and configs reach Linux
  with CRLF line endings.

The suite was believed to be hermetic. **It was not.** One service suite passed only because a
developer `.env` supplied `STORAGE_ROOT`. Running the suite inside a release, which has no `.env`,
found this.

## Decision

### 1. systemd, not a process manager or container

The committed `scripts/systemd/dimension.service` provides:

- an unprivileged non-login identity
- the active release as `WorkingDirectory`
- an out-of-band `EnvironmentFile`
- `Restart=on-failure`
- `TimeoutStopSec` ordered against the application's grace period
- journal logging
- `ProtectSystem=strict` plus `ReadWritePaths=` limited to the store and the storage root

*Rejected:*

- **pm2.** A global npm install and a second supervisor for a single process. It also sits uneasily
  with a manifest pinned at seven packages.
- **`nohup`.** No restart policy, no stop timeout, no identity and no log capture.

**No Docker.** The demonstrated-requirement test asks: does anything here need process isolation, a
reproducible filesystem layer, or an artifact registry? There is one process (systemd covers it), no
build step (the artifact is the commit plus a lockfile install), and no registry (the artifact goes
straight from the trigger to the host). All three answers are no. An image would be a second thing to
version and would contradict ADR-001's "trivially simple" deployment. Revisit when one of the three
becomes a real requirement.

### 2. The data directory is an explicit input (`AFM_DATA_DIR`)

Both stores resolve `path.join(resolveDataDir(), …)`. The value is `AFM_DATA_DIR`, falling back to
`<cwd>/data`. The fallback applies **only outside production**: with `NODE_ENV=production` an unset
`AFM_DATA_DIR` refuses startup, which satisfies "an unset base directory is a configuration error"
without changing development or any suite.

*Rejected: a `releases/<id>/data → shared/data` symlink.* It needs no source change, but correctness
then rests on a filesystem fact created only by the deploy script. A missing or mistargeted link makes
`_init()` silently write a fresh empty store. An explicit variable turns that "silently wrong"
outcome into "refuses to start". The resolver lives in a side-effect-free `src/config/dataDir.js`,
so the stores do not import the whole configuration.

### 3. Configuration fails at startup, not per request

`config.validateStartup()` runs in `server.js` before `listen`. It rejects:

- an absent `STORAGE_ROOT`
- a relative or foreign-platform `STORAGE_ROOT`
- a `STORAGE_ROOT` that is missing, not a directory, or not readable and traversable
- a malformed `UPLOAD_MAX_BYTES` (zero, negative, fractional, non-numeric, or beyond the safe range)
- a relative or missing `AFM_DATA_DIR`
- production without `AFM_DATA_DIR`

Nothing is created implicitly. The checks are deliberately **not** run when the module is loaded.
The old presence check there (`process.exit` inside `env.js`) is why the suite depended on a
developer `.env`, and service suites legitimately load the configuration with roots that exist only
as strings. `PathService` fails closed without a root (`path.resolve(undefined)` throws).

### 4. Graceful shutdown with ordered timeouts

On `SIGTERM`/`SIGINT` the server stops accepting connections, closes idle keep-alives, lets in-flight
requests finish, and force-exits after **30 s**. systemd's `TimeoutStopSec` is **45 s** and nginx's
read/body timeouts are **600 s**, so each outer layer outlasts the inner one. `module.exports = server`
is unchanged. *Rejected:* `process.exit()` on signal and `closeAllConnections()`, which both
abandon work, and a shutdown library, which would be a dependency for about 15 lines.

### 5. One host-side deploy mechanism, separate triggers

`scripts/deploy.sh` runs on the host and is a function of (artifact, commit). It performs:

lock → unpack into `releases/<UTC>-<sha12>` → completeness and forbidden-path check → configuration
and store-presence check → `npm ci --omit=dev` → **`npm test` in the release** → `rename(2)` of the
`current` symlink → restart → poll `/api/v1/health` for `apiVersion: 1` → automatic rollback on
failure → prune to 5, never touching the active or previous release.

It ends with a machine-readable `DEPLOY_OUTCOME` (`success` / `pre-activation-failed` /
`rolled-back` / `rollback-failed` / `superseded`). Deployments are serialised with `flock`. A commit
older than the active one is refused as `superseded`. `rollback` is a single command.

Triggers are interchangeable:

- `scripts/trigger-deploy.sh` for manual runs
- `scripts/git-hooks/post-receive` in the existing bare repository, which is primary because the Git
  server can reach the host over SSH
- a hosted CI workflow, only if an eligible remote is ever added; none exists, so none is written

The deploy key is confined to `deploy.sh ssh`, a forced command that accepts only `receive`,
`rollback` and `status`. The host-side suite gate stays even if hosted CI appears, because it
catches a bad host as well as a bad commit.

**The post-receive hook gates the deployment, not the push** (a post-receive hook cannot reject a
push). This is sufficient because only one machine pushes. With several, use a pre-receive gate.

### 6. The artifact is an allow-list `git archive` of one commit

D3 in the design proposed a tarball with an exclusion list and rejected `git archive` because it
"ships whatever is tracked". The implementation uses **`git archive` restricted to an allow-list**:
`server.js`, `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `src`, `public`, `test`
and `scripts`. This is strictly stronger than D3's version:

- it is one exact commit, so no untracked working-tree file can leak
- an undeclared path is never shipped, which is what `deployment-artifact` literally requires
- it works inside the bare repository, where the hook has no working tree

`trigger-deploy.sh` and `deploy.sh` both still reject forbidden paths as a backstop. `test/`,
`package.json` and `.gitignore` ship because the gate runs the suite in the release. The result is
80 of 492 tracked files, about 300 KB.

### 7. Hygiene at the source

- `.env` and `data/metadata.json.corrupt-backup` are untracked.
- `data/*` (except `.gitkeep`) is ignored.
- `.gitattributes` pins `eol=lf` for `*.sh`, `*.service`, `*.conf` and `scripts/git-hooks/*` only.
  A repo-wide rule would renormalise every file.
- Scripts run as `bash <path>`, because the exec bit is not recorded.
- Node is pinned: `.nvmrc` holds `24.15.0` and `engines` is `>=24 <25`.
- `repository.url` matches the real remote.

**History is not rewritten.** The committed `.env` held a port, an environment name and a local
path, and no credential. Rewriting would be destructive and would protect nothing.

### 8. Exposure stays gated on authentication

The firewall (deny by default, allowing only 22, 80 and 443) is a **compensating control** for an
application that binds every interface. Adding a bind-host argument is deferred to the authentication
work: `app.listen` is load-bearing for the suites that read `server.address().port`. CORS and CSP
are unchanged. This ADR does not make the service safe to expose publicly.

## Consequences

- A deploy is one command, produces one immutable directory, is reverted by one command, and cannot
  touch the store or the storage root.
- A mistyped configuration value fails at startup with a named variable.
- The suite is now hermetic. It passes inside a release with no `.env` and only production
  dependencies installed: 772/772, observed.
- **Open finding, not fixed here:** Node's `server.requestTimeout` defaults to 300 s, which ends
  uploads that take longer than 5 minutes regardless of nginx. Fixing it is a request-path change.
- **Unverified until a Linux host exists:** atomic switch, rollback, prune, `systemd-analyze`,
  `nginx -t`, the firewall, persistence across deploys, and the Linux suite run. The Windows
  development environment cannot create the symlinks those steps rely on.
