# DEPLOYMENT.md — Operator Runbook

> How to run Dimension Files Manager on one Linux host, deploy new commits, and roll back.
> Decision record: `docs/decisions/ADR-008-production-deployment.md`. Change:
> `openspec/changes/production-cicd-readiness`.

## ⚠ Read first: this service is not safe to expose publicly

- **The API is unauthenticated.** Anyone who can reach it can upload, rename, permanently delete
  and download every file under `STORAGE_ROOT` (ADR-003). This remains the one Critical gap.
- **The application binds every interface.** `app.listen(PORT)` takes no host argument, and there is
  no setting to change that. The host firewall is the **compensating control**. It is not
  authentication: anything that can reach the port can use the API.

Reduced by `api-security-hardening`, but **not** closed by it:

- **Cross-origin access is same-origin by default** — the CORS middleware is only registered when
  `AFM_CORS_ENABLED=true`, from a validated allowlist. A web page the operator visits can no longer
  drive the mutating endpoints from their browser unless the operator has explicitly allowed that
  origin.
- **A content security policy is enabled** (`script-src 'self'`, no `'unsafe-inline'`, no
  `unsafe-eval`). Render-time escaping is still the layer for filesystem-derived strings;
  `style-src` still permits inline styles.
- **Mutating routes are rate limited** and uploads are refused when the volume is low on space.

Because **nothing authenticates**, those reduce drive-by and abuse exposure; they are not access
control. TLS, the proxy and the firewall encrypt transport and narrow reachability. **They do not
close the authentication gap.** Keep the service on a trusted network until authentication lands.
The service is a browser admin surface, not a supported integration API.

## Host layout

| Path | Owner / mode | Purpose |
|---|---|---|
| `/opt/dimension/releases/<UTC-stamp>-<sha12>/` | `dimension-deploy`, read-only after install | One immutable release per deploy |
| `/opt/dimension/current` → a release | `dimension-deploy` | Active release (systemd `WorkingDirectory`) |
| `/opt/dimension/previous` → a release | `dimension-deploy` | What `rollback` restores |
| `/opt/dimension/bin/deploy.sh` | `root:root 0755` | The deploy mechanism (copied from `scripts/deploy.sh`) |
| `/opt/dimension/logs/` | `dimension-deploy` | Suite-gate output per release |
| `/opt/dimension/last-deploy.json`, `deployments.log` | `dimension-deploy` | Deployment outcomes |
| `/etc/dimension/dimension.env` | `root:dimension 0640` | Runtime configuration (out of band, never in a release) |
| `/var/lib/dimension/` (`AFM_DATA_DIR`) | `dimension:dimension 0750` | `metadata.json`, `settings.json` |
| `/srv/dimension/storage/` (`STORAGE_ROOT`) | `dimension:dimension 0750` | The operator's files |

The service identity `dimension` **cannot write** any release or its configuration. It can write only
the store and the storage root, and systemd's `ReadWritePaths=` repeats that restriction.

## Configuration

Delivered by the systemd `EnvironmentFile`. The template is `.env.example`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STORAGE_ROOT` | **yes** | — | Absolute, existing, readable/traversable directory. Never created automatically. A relative path, a Windows path on Linux, a missing directory or a file all **refuse startup**. |
| `AFM_DATA_DIR` | **yes in production** | `<cwd>/data` outside production | Absolute, existing directory for the stores. `NODE_ENV=production` without it **refuses startup**. Must live outside `/opt/dimension`. |
| `NODE_ENV` | no | `development` | The unit sets `production`. |
| `PORT` | no | `3000` | Must match the nginx `upstream` and is what `deploy.sh` health-checks. |
| `UPLOAD_MAX_BYTES` | no | `5368709120` (5 GiB) | A positive integer. Anything else **refuses startup**. Keep nginx `client_max_body_size` above it. |

Security controls added by `api-security-hardening`. **All are optional and every default is the
safe one** — an unset `EnvironmentFile` never widens access.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AFM_CORS_ENABLED` | no | `false` | **Leave unset.** The default registers no CORS middleware, so no `Access-Control-Allow-*` header is emitted and every cross-origin call is refused by the browser. Set `true` only for a deliberately cross-origin client. |
| `AFM_CORS_ALLOWED_ORIGINS` | no | *(empty)* | Comma-separated **absolute** origins (`https://files.example.internal`). Each must be `http`/`https` with a host and **no path, query or fragment**; no scheme-relative values, no duplicates, max 20. A malformed entry **refuses startup**. |
| `AFM_CORS_ALLOW_WILDCARD` | no | `false` | Permits a literal `*` entry. **Refuses startup when `NODE_ENV=production`** — a wildcard is incompatible with the authentication this service still lacks. |
| `AFM_UPLOAD_FREE_SPACE_BYTES` | no | `104857600` (100 MiB) | Free space required on the staging volume before an upload is accepted; below it the upload is refused with `507` **before any byte is written**. `0` disables the check. A non-integer or negative value **refuses startup**. |
| `AFM_UPLOAD_MAX_CONCURRENT` | no | `4` | Uploads this process accepts at once; the excess gets `429`. `0` disables. |
| `AFM_RATE_LIMIT_WRITE_PER_MINUTE` | no | `60` | Per-client allowance for mutating routes. `0` disables. |
| `AFM_RATE_LIMIT_READ_PER_MINUTE` | no | `600` | Per-client allowance for read routes — a separate bucket, so a read burst never spends the mutation allowance. `0` disables. |

> Rate limits are keyed on `req.ip`, which the app trusts as the forwarded client address because
> `server.js` sets `trust proxy` to the single documented nginx hop. If you insert another proxy in
> front, that constant must change with it, or every client will share one key.

- **Precedence:** a variable already in the process environment always wins. `dotenv` only fills
  unset variables, so a stray `.env` in a working directory can never override the `EnvironmentFile`.
- **Read once at startup.** A change takes effect only after `systemctl restart dimension`. There is
  no live reload.
- **Startup diagnostics** log the port, storage root, data directory and environment. A refused start
  logs `FATAL CONFIGURATION ERROR: <variable> …` to the journal.

## First install (one host)

Run these as root. Replace `files.example.internal`, the certificate paths and the key.

1. **Runtime and tools.** Install Node **24.15.0** (`.nvmrc`; `package.json` `engines` is
   `>=24 <25`) at `/usr/bin/node`, plus `npm`, `curl`, `tar`, `util-linux` (`flock`) and nginx.
   Check with `node -v`.
2. **Identities.**
   ```bash
   useradd --system --shell /usr/sbin/nologin --no-create-home dimension
   useradd --create-home --shell /bin/bash dimension-deploy
   usermod -aG dimension dimension-deploy        # group-read of the env file only
   ```
3. **Directories.**
   ```bash
   install -d -o dimension-deploy -g dimension-deploy -m 0755 /opt/dimension /opt/dimension/releases /opt/dimension/logs
   install -d -o root -g root -m 0755 /opt/dimension/bin
   install -d -o dimension -g dimension -m 0750 /var/lib/dimension /srv/dimension/storage
   install -d -o root -g dimension -m 0750 /etc/dimension
   ```
4. **Configuration.** Create `/etc/dimension/dimension.env` with mode `0640 root:dimension`:
   ```
   STORAGE_ROOT=/srv/dimension/storage
   AFM_DATA_DIR=/var/lib/dimension
   PORT=3000
   ```
   Then check that `find /etc/dimension -perm -o+r` prints nothing.
5. **Deploy script and restart right.**
   ```bash
   install -m 0755 scripts/deploy.sh /opt/dimension/bin/deploy.sh
   echo 'dimension-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart dimension' > /etc/sudoers.d/dimension-deploy
   chmod 0440 /etc/sudoers.d/dimension-deploy && visudo -cf /etc/sudoers.d/dimension-deploy
   ```
6. **systemd.** `install -m 0644 scripts/systemd/dimension.service /etc/systemd/system/`, then
   `systemd-analyze verify /etc/systemd/system/dimension.service`, then `systemctl daemon-reload` and
   `systemctl enable dimension`. Don't start it yet; `current` doesn't exist.
7. **nginx.** Install `scripts/nginx/dimension.conf` into `sites-available`, link it into
   `sites-enabled`, and set `server_name` and the certificate. **Always run `nginx -t` before
   `systemctl reload nginx`.**
8. **Firewall: deny by default.** Add the SSH rule **before** enabling enforcement:
   ```bash
   ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
   ```
   Port 3000 is not opened. Check from another machine that `curl http://<host>:3000/api/v1/health`
   fails while `curl http://127.0.0.1:3000/api/v1/health` succeeds on the host.
9. **Deploy key.** In `~dimension-deploy/.ssh/authorized_keys`, restrict the key to the deploy
   entry point:
   ```
   command="bash /opt/dimension/bin/deploy.sh ssh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA… dimension-deploy
   ```
   That key can run `receive <sha> [epoch]`, `rollback` and `status`, and nothing else. It gets no
   shell. The private key stays on the machine that triggers deploys and is never committed.
10. **First deployment, watched.** From a checkout, run
    `SSH_OPTS="-i ~/.ssh/dimension_deploy" bash scripts/trigger-deploy.sh dimension-deploy@<host> master`.
    Check that `DEPLOY_OUTCOME=success` is printed, that `systemctl status dimension` is active, and
    that `curl -s https://<host>/api/v1/health` reports `"apiVersion":1`.

## Deploy

`bash scripts/trigger-deploy.sh <user@host> [ref]` builds an artifact from **one commit** and sends
it over a single SSH session. The artifact is a `git archive` of an allow-list: `server.js`,
`package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `src/`, `public/`, `test/` and
`scripts/`. On the host, `deploy.sh` then runs these steps:

1. **Lock** (`flock`). Deployments never interleave. A commit older than the active one ends as
   `superseded` and is not activated (set `DEPLOY_ALLOW_OLDER=1` to override deliberately).
2. **Unpack** into `releases/<UTC-stamp>-<sha12>`. Every deploy gets a distinct directory, even for
   the same commit.
3. **Validate.** The required runtime paths must be present and the forbidden ones (`.env`, `.git`,
   `node_modules`, store documents, tooling trees) absent. `STORAGE_ROOT` and `AFM_DATA_DIR` must be
   existing absolute directories outside `/opt/dimension`. Once any release has run, the store must
   already exist; an empty `AFM_DATA_DIR` is refused rather than silently starting a blank store.
4. **Install** with `npm ci --omit=dev`. It installs exactly what the lockfile says, without dev
   dependencies, and fails if the manifest and the lockfile disagree.
5. **Gate on the suite:** `npm test`, unmodified, runs inside the release with the production
   variables withheld. The suite uses temp directories and port 0, so it never touches the store or
   the storage root. Its output goes to `logs/test-<release>.log`.
6. **Activate atomically.** The `current` symlink is replaced by `rename(2)`, so there is never a
   moment without an active release. Then `systemctl restart dimension` runs.
7. **Health-check** `http://127.0.0.1:$PORT/api/v1/health` for up to 60 s. The check requires
   `"success":true` and `"apiVersion":1`.
8. **On failure, roll back automatically** to the previous release, restart, and check health again.
9. **Prune** down to 5 releases (`KEEP_RELEASES`). The active and previous releases are never
   removed, and a pruning failure never fails the deploy.

**Outcome:** the last line of output is `DEPLOY_OUTCOME=<outcome> release=… commit=… previous=…`.
The same information is written to `/opt/dimension/last-deploy.json`.

| Outcome | Exit | Meaning |
|---|---|---|
| `success` | 0 | Activated and healthy |
| `pre-activation-failed` | 2 | Never activated; the previous release still serves |
| `rolled-back` | 3 | Activated, then failed restart or health; the previous release was restored |
| `rollback-failed` | 4 | The restore **also** failed, or a first deploy failed with nothing to restore. Investigate now. |
| `superseded` | 5 | A newer commit is already active; nothing changed |

**Automatic trigger.** `scripts/git-hooks/post-receive` runs in the bare repository. Its install
steps are in the file header and use `git config dimension.deployTarget`, `deployBranch` and
`sshOpts`. A push to the deployment branch runs `trigger-deploy.sh`. A post-receive hook **cannot
reject a push**, so it gates the deployment instead: a commit whose suite fails on the host reaches
the remote and deploys nowhere. The hook prints the outcome. This is sufficient while only one
machine pushes; with more than one, add a pre-receive gate.

## Rollback

```bash
ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> rollback      # via the restricted key
sudo -u dimension-deploy bash /opt/dimension/bin/deploy.sh rollback  # on the host
```

This swaps `current` and `previous`, restarts and health-checks. It needs no rebuild, no install and
no network. Running it twice returns to where you started. Rollback restores **code only**. The store
in `AFM_DATA_DIR` and the files in `STORAGE_ROOT` are not touched in either direction.

## Status and logs

- `ssh … status` or `bash /opt/dimension/bin/deploy.sh status` shows the active and previous
  releases, the retained list and the last outcome. The active commit is in the release directory
  name and in `current/.release-commit`.
- Application logs: `journalctl -u dimension` (`-f` to follow). The app has no log file of its own,
  and `morgan('dev')` request lines go to the journal.
- Suite-gate output: `/opt/dimension/logs/test-<release>.log`.

## Persistence, backup and restore

The store (`metadata.json`, `settings.json` under `AFM_DATA_DIR`) and `STORAGE_ROOT` live outside
every release. Activation, rollback and pruning cannot affect them. When a store file is created the
journal records `[store] First run: initialised an empty … store`. If that line appears on a host
that has run before, the store has been lost or relocated.

- **Back up** with `cp --preserve /var/lib/dimension/metadata.json /backup/metadata-$(date +%F).json`.
  The store is replaced by rename, so a copy is always one complete document.
- **Restore** with the service stopped:
  `systemctl stop dimension`, then
  `install -o dimension -g dimension -m 0640 /backup/metadata-….json /var/lib/dimension/metadata.json.restore`,
  then `mv /var/lib/dimension/metadata.json.restore /var/lib/dimension/metadata.json`, then
  `rm -f /var/lib/dimension/*.tmp`, then `systemctl start dimension`. Never write into the live file
  in place.

## Restarts, timeouts and limits

| Component | Value | Why |
|---|---|---|
| App shutdown grace (`server.js`) | 30 s | `SIGTERM` stops new connections and drains in-flight uploads and downloads, then forces exit |
| systemd `TimeoutStopSec` | 45 s | Must exceed the app's grace, or systemd kills a draining process |
| nginx `proxy_read_timeout` / `client_body_timeout` | 600 s | Must exceed both |
| nginx `client_max_body_size` | 6g | Must stay **above** `UPLOAD_MAX_BYTES` so the app decides acceptance. Raise both together. |

**Known limit, not fixed by this change:** Node's own `server.requestTimeout` defaults to **300 s**.
An upload that takes longer than 5 minutes to arrive is ended by the application, whatever nginx
allows. At about 17 MB/s a 5 GiB upload takes roughly 300 s. Raising the timeout changes
request-path behaviour and belongs in its own change.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `FATAL CONFIGURATION ERROR` in the journal, unit restarting | A value in `/etc/dimension/dimension.env` is unusable; the message names it. Fix the value and restart. |
| `pre-activation-failed` … `test suite failed` | Read `logs/test-<release>.log`. Nothing was activated. |
| `pre-activation-failed` … `npm ci failed` | The lockfile is out of date, or the registry is unreachable from the host. |
| `pre-activation-failed` … `holds no store` | `AFM_DATA_DIR` points at an empty directory on a host that has run before. Point it back at the real store. |
| `rolled-back` | The new release did not answer `/api/v1/health` within 60 s. Check `journalctl -u dimension` around the deploy time. |
| `413` from nginx on a large upload | `client_max_body_size` is below `UPLOAD_MAX_BYTES`. |
| `\r: command not found` | A script arrived with CRLF line endings. `.gitattributes` pins LF for `*.sh`, `*.service`, `*.conf` and the hook; re-checkout. |

## Verification status (record honestly)

As of 2026-10-04, everything below was verified on **Windows 10, Node 24.15.0** only:

- the suite (772 pass)
- the startup validation and graceful-shutdown assertion runs
- packaging
- `deploy.sh`'s pre-activation failures, and its lockfile install plus suite gate inside a release

**Not yet exercised on Linux:** atomic activation, rollback, pruning, `systemd-analyze verify`,
`nginx -t`, the firewall, persistence across real deploys, the suite itself (task 6.6), and the
POSIX-only rejection of a Windows-style `STORAGE_ROOT`. The Windows environment cannot create the
symlinks those steps rely on. Complete them on the target host (tasks 4.x, 5.x, 6.6) before trusting
the pipeline unattended.
