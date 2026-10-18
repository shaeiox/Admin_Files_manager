# DEPLOYMENT.md — Operator Runbook

> Everything needed to run Dimension Files Manager on one Linux host: what to install, every
> configuration variable, a ready-to-fill production env file, first install, deploys, rollback,
> backup and troubleshooting.
> Decision records: `docs/decisions/ADR-008-production-deployment.md` (pipeline),
> ADR-009 (authentication). nginx details: `scripts/nginx/README.md`.

## ⚠ Read first: security posture

The service is **not safe to expose publicly** without the nginx gate in front of it. Here is what
it does and does not protect:

- **The API is authenticated (ADR-009).** Every endpoint except `GET /api/v1/health` and
  `POST /api/v1/auth/login` needs a session plus a CSRF header on non-GET requests. Those two are the
  only unauthenticated endpoints.
- **Authorization is flat.** Any active account, `user` or `admin`, can upload, rename, move, copy,
  permanently delete and download every file under `STORAGE_ROOT`. The `admin` role adds only the
  Admin pages (users, groups, portal policies, logs). Give accounts only to people you would trust
  with the whole tree.
- **Keep nginx's basic-auth gate** on the admin vhost (`scripts/nginx/cloudavid.conf`). It is a second
  factor in front of the app's login and blocks anonymous scanning of the login form.
- **Production binds `127.0.0.1` only** (`HOST` overrides). nginx is the only intended client. The
  firewall still keeps port 3000 closed as a second layer.
- **TLS is required for real use.** The session cookie gets `Secure` when nginx reports
  `X-Forwarded-Proto: https`. Over the plain-HTTP test config (`cloudavid-test-http.conf`) passwords
  and session cookies travel in cleartext. Use that config for a first smoke test only.
- Also in place: same-origin CORS by default, a content security policy (`script-src 'self'`;
  `style-src` still allows inline styles), rate limits on mutating routes and on login, upload
  free-space and concurrency limits, and symlink containment on every read and write path.

## Pre-flight checklist

- [ ] Linux host with systemd, nginx, Node **24.x** at `/usr/bin/node`, `npm`, `curl`, `tar`, `flock`
- [ ] DNS for the admin name (and the portal name, if used) points at the host
- [ ] TLS certificate covering **every** name nginx serves (`scripts/nginx/README.md` §1)
- [ ] The admin origin is served over **HTTPS** — session renewal needs it: browsers expose
      WebCrypto only in a secure context, so over plain HTTP a session ends with its first access
      token (`AFM_ACCESS_TTL_SECONDS`, 15 min by default) and the operator signs in again
- [ ] Users `dimension` (service) and `dimension-deploy` (deploys) created
- [ ] Directories created with the owners and modes in **Host layout**
- [ ] `/etc/dimension/dimension.env` written from **Production env file**, mode `0640 root:dimension`
- [ ] Bootstrap admin username/password set for the first boot, then removed (step 13)
- [ ] systemd unit installed and `systemd-analyze verify` clean
- [ ] nginx config installed, htpasswd file created, `nginx -t` clean
- [ ] Firewall: 22/80/443 open, 3000 closed
- [ ] Restricted deploy key installed
- [ ] First deploy prints `DEPLOY_OUTCOME=success`, and you can log in through `https://`
- [ ] Backups scheduled for `AFM_DATA_DIR` (all three stores) and `STORAGE_ROOT`

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
| `/var/lib/dimension/` (`AFM_DATA_DIR`) | `dimension:dimension 0750` | `admin.sqlite` (accounts, sessions, policies, audit log), `metadata.json`, `settings.json` |
| `/srv/dimension/storage/` (`STORAGE_ROOT`) | `dimension:dimension 0750` | The operator's files |

The service identity `dimension` **cannot write** any release or its own configuration. It can write
only the stores, the storage root and the folder markers (ADR-010). systemd's `ReadWritePaths=`
enforces the same list.

## Configuration reference

All variables come from the systemd `EnvironmentFile` (`/etc/dimension/dimension.env`). The
annotated template is `.env.example`, and a filled-in production example is in the next section.

- **Precedence:** a variable already in the process environment always wins. `dotenv` only fills
  unset variables, so a stray `.env` in a working directory can never override the `EnvironmentFile`.
- **Read once at startup.** A change takes effect only after `systemctl restart dimension`.
- **Fail closed.** A malformed value is never ignored. The process logs
  `FATAL CONFIGURATION ERROR: <variable> …` to the journal and refuses to start.

### Core

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STORAGE_ROOT` | **yes** | — | Absolute, existing, readable/traversable directory. Never created automatically. A relative path, a Windows path on Linux, a missing directory or a file all **refuse startup**. It may itself be a symlink (e.g. to a mounted disk). |
| `AFM_DATA_DIR` | **yes in production** | `<cwd>/data` outside production | Absolute, existing directory for the three stores. `NODE_ENV=production` without it **refuses startup**. Must live outside `/opt/dimension`. |
| `NODE_ENV` | no | `development` | The systemd unit sets `production`. Do not set it in the env file. |
| `PORT` | no | `3000` | Must match the nginx `proxy_pass` port; `deploy.sh` health-checks it. |
| `HOST` | no | `127.0.0.1` in production, all interfaces otherwise | Interface to bind. Leave unset behind nginx. Set `0.0.0.0` only if nothing but nginx can reach the port. |
| `UPLOAD_MAX_BYTES` | no | `5368709120` (5 GiB) | A positive integer, or startup is refused. Keep nginx `client_max_body_size` **above** it. |
| `APP_VERSION` | no | `package.json` version | Label shown next to the brand in the sidebar. |

### Security controls

These were added by `api-security-hardening`. **All are optional and every default is the safe
one**, so an unset value never widens access.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AFM_CORS_ENABLED` | no | `false` | **Leave unset.** No CORS middleware is registered, so no `Access-Control-Allow-*` header is emitted. Set `true` only for a deliberately cross-origin client. |
| `AFM_CORS_ALLOWED_ORIGINS` | no | *(empty)* | Comma-separated **absolute** origins (`https://files.example.internal`): `http`/`https` with a host, **no path, query or fragment**, no duplicates, at most 20. A malformed entry **refuses startup**. |
| `AFM_CORS_ALLOW_WILDCARD` | no | `false` | Permits a literal `*`. **Refuses startup when `NODE_ENV=production`.** |
| `AFM_UPLOAD_FREE_SPACE_BYTES` | no | `104857600` (100 MiB) | Free space required before an upload is accepted; below it the upload gets `507` **before any byte is written**. `0` disables the check. |
| `AFM_UPLOAD_MAX_CONCURRENT` | no | `4` | Uploads accepted at once; the excess gets `429`. `0` disables the limit. |
| `AFM_RATE_LIMIT_WRITE_PER_MINUTE` | no | `60` | Per-client allowance for mutating routes. `0` disables the limit. |
| `AFM_RATE_LIMIT_READ_PER_MINUTE` | no | `600` | Per-client allowance for read routes, in a separate bucket. `0` disables the limit. |

> Rate limits are keyed on `req.ip`. `server.js` trusts exactly one proxy hop (nginx) for that
> address. If you put another proxy in front, change `NGINX_PROXY_HOPS` with it, or every client
> will share one key.

### Identity (ADR-009)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AFM_LOGIN_RATE_LIMIT_PER_MINUTE` | no | `10` | Per-IP login attempts per minute. Accounts also lock for 15 minutes after 10 consecutive failures. |
| `AFM_BOOTSTRAP_ADMIN_USERNAME` | **first boot only** | *(unset)* | Creates the first admin when the account table is **empty**. With no account and no pair set, the admin panel is unreachable. Setting only one of the pair **refuses startup**. |
| `AFM_BOOTSTRAP_ADMIN_PASSWORD` | **first boot only** | *(unset)* | At least 8 characters, or startup is refused. Never logged. **Remove both lines after the first successful login** (step 13). |

### File Portal link (optional)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORTAL_LOG_FILE` | no | *(unset)* | Absolute path of the File Portal's trace log (the portal's `LOG_FILE`). Enables Admin → Logs → File portal. `PORTAL_ROOT` is retired and ignored (ADR-010). |

#### How the link works (ADR-010)

The File Portal reads `admin.sqlite` read-only. The two services share **logical** values only, so
the storage, the release folder and either service's releases may live anywhere:

- **Storage identity.** On first start this service writes `STORAGE_ROOT/.dimension-volume` (a
  UUID, also stored in `admin.sqlite`). The marker is hidden and unreachable through the API.
  **Back it up with the storage**, and never copy it into another storage root.
- **Any folder as portal root, nothing to configure.** The portal's `FILES_ROOT` may be the storage
  or any folder in it, mounted anywhere. Example: this service's `STORAGE_ROOT=C:\Users\eleven`, the
  portal's `FILES_ROOT=C:\Users\eleven\Downloads`. The portal climbs to the storage marker, finds it
  is the admin folder `/Downloads` (it logs `FILES_ROOT is the admin folder /Downloads`), and
  decides every path as `/Downloads/…`. Policies on `/Downloads` and on `/` apply there too, and a
  policy on `/docs` does not. Several portals may serve different folders of one storage at once.
- **Portal folder (optional).** Only for a portal host that cannot see the storage root, such as a
  container or share that mounts just `Downloads`. Set **Portal folder** to `/Downloads` in Admin →
  File portal; this service writes a marker into that folder naming it, which such a host trusts.
  Rename the folder only through the API (the stored path follows it).
- **Recovery** when Admin → File portal reports the marker `missing`: first make sure `STORAGE_ROOT`
  points at the real storage. Then recreate it with the id shown there:
  `printf '{"volumeId":"<id>","clientPath":"/"}\n' > "$STORAGE_ROOT/.dimension-volume"` (owner
  `dimension`, mode `0640`). The portal-root marker is restored automatically once this one is. `mismatch` means `STORAGE_ROOT` holds another volume's marker: fix the path, do not edit
  the marker. `unwritable` means the root is read-only: make it writable and restart.
- **Release folder and portal sign-in limits** are set in Admin → File portal. The portal applies
  them within its sync interval, with no restart.
- **A release disk elsewhere:** bind-mount it inside the storage
  (`mount --bind /mnt/releases /srv/dimension/storage/release`) and select that folder. A symlink
  or a Windows junction is refused by both services' containment checks.
- **Upgrade order:** portal first (it accepts admin schema v4 and v5), then this service (migration
  5, writes the marker), then set and lock the release folder, then remove `RELEASE_PVM` (portal)
  and `PORTAL_ROOT` (here).

The portal itself (`files-server-web`) reads `admin.sqlite` from `AFM_DATA_DIR` for its access
policies. Give its service read access to that directory if it runs as a different user.

## Production env file

Write this to `/etc/dimension/dimension.env`, owned `root:dimension`, mode `0640`. Unset lines
keep their safe defaults.

```bash
# /etc/dimension/dimension.env - read by systemd (EnvironmentFile); restart to apply.

# --- Required ---
STORAGE_ROOT=/srv/dimension/storage
AFM_DATA_DIR=/var/lib/dimension

# --- Network (nginx proxies to 127.0.0.1:3000) ---
PORT=3000
# HOST=127.0.0.1                  # default in production; leave unset

# --- Uploads ---
UPLOAD_MAX_BYTES=5368709120       # 5 GiB; keep nginx client_max_body_size (6g) above it
# AFM_UPLOAD_FREE_SPACE_BYTES=104857600
# AFM_UPLOAD_MAX_CONCURRENT=4

# --- Abuse limits (defaults shown) ---
# AFM_RATE_LIMIT_WRITE_PER_MINUTE=60
# AFM_RATE_LIMIT_READ_PER_MINUTE=600
# AFM_LOGIN_RATE_LIMIT_PER_MINUTE=10

# --- CORS: leave unset (same-origin) ---
# AFM_CORS_ENABLED=false

# --- First boot ONLY: delete both lines after the first login, then restart ---
AFM_BOOTSTRAP_ADMIN_USERNAME=admin
AFM_BOOTSTRAP_ADMIN_PASSWORD=<at-least-8-chars-generate-me>

# --- Optional ---
# APP_VERSION=2.4.0
# PORTAL_LOG_FILE=/var/www/html/files-server-web/data/portal.log
```

Generate the password with `openssl rand -base64 18`. Afterwards,
`find /etc/dimension -perm -o+r` must print nothing.

## First install (one host)

Run these as root. Replace host names, certificate paths and keys with your own.

1. **Runtime and tools.** Install Node **24.x** (`.nvmrc` pins 24.15.0; `package.json` `engines` is
   `>=24 <25`) at `/usr/bin/node`, plus `npm`, `curl`, `tar`, `util-linux` (`flock`), nginx and,
   for online backups, `sqlite3`. Check with `node -v`.
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
   If the files live on another disk, mount it and make `/srv/dimension/storage` that mount or a
   symlink to it. Either works.
4. **Configuration.** Write `/etc/dimension/dimension.env` from **Production env file**, then:
   ```bash
   chown root:dimension /etc/dimension/dimension.env && chmod 0640 /etc/dimension/dimension.env
   ```
5. **Deploy script and restart right.**
   ```bash
   install -m 0755 scripts/deploy.sh /opt/dimension/bin/deploy.sh
   echo 'dimension-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart dimension' > /etc/sudoers.d/dimension-deploy
   chmod 0440 /etc/sudoers.d/dimension-deploy && visudo -cf /etc/sudoers.d/dimension-deploy
   ```
6. **systemd.** Install and verify the unit, then enable it:
   ```bash
   install -m 0644 scripts/systemd/dimension.service /etc/systemd/system/
   systemd-analyze verify /etc/systemd/system/dimension.service
   systemctl daemon-reload && systemctl enable dimension
   ```
   Don't start it yet: `current` doesn't exist.
7. **TLS certificate** covering every served name (`scripts/nginx/README.md` §1):
   ```bash
   certbot certonly --nginx -d files.example.com -d adminfiles.example.com
   ```
8. **Basic-auth file**, created **before** nginx loads the config. Without it every admin request
   gets a 500:
   ```bash
   htpasswd -cB /etc/nginx/cloudavid-admin.htpasswd <gate-user>
   chown root:www-data /etc/nginx/cloudavid-admin.htpasswd && chmod 640 /etc/nginx/cloudavid-admin.htpasswd
   ```
9. **nginx.** Install `scripts/nginx/cloudavid.conf`, set `server_name` and the certificate paths
   (§3 of the nginx README), and keep `proxy_set_header X-Forwarded-Proto $scheme` (the `Secure`
   cookie depends on it):
   ```bash
   install -m 0644 scripts/nginx/cloudavid.conf /etc/nginx/sites-available/cloudavid.conf
   ln -sf ../sites-available/cloudavid.conf /etc/nginx/sites-enabled/cloudavid.conf
   nginx -t && systemctl reload nginx     # ALWAYS validate before reloading
   ```
10. **Firewall: deny by default.** Add the SSH rule **before** enabling enforcement:
    ```bash
    ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
    ```
    Port 3000 is never opened. The app binds loopback anyway, so
    `curl http://<host>:3000/api/v1/health` from another machine must fail.
11. **Deploy key.** In `~dimension-deploy/.ssh/authorized_keys`, restrict the key to the deploy
    entry point:
    ```
    command="bash /opt/dimension/bin/deploy.sh ssh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA… dimension-deploy
    ```
    That key can run `receive <sha> [epoch]`, `rollback` and `status`, and nothing else. The private
    key stays on the machine that triggers deploys and is never committed.
12. **First deployment, watched.** From a checkout, run
    `SSH_OPTS="-i ~/.ssh/dimension_deploy" bash scripts/trigger-deploy.sh dimension-deploy@<host> master`.
    Check that `DEPLOY_OUTCOME=success` is printed, that `systemctl status dimension` is active, and
    that `curl -s https://<admin-host>/api/v1/health -u <gate-user>` reports `"apiVersion":1`.
13. **First login, then remove the bootstrap secret.** Open `https://<admin-host>/`, pass the
    basic-auth prompt, and sign in with the bootstrap admin. Then delete both `AFM_BOOTSTRAP_ADMIN_*`
    lines from the env file and run `systemctl restart dimension`. The account stays in
    `admin.sqlite`. Create named accounts under Admin → Users. The last active admin can never be
    disabled or deleted (`409`).

## Deploy

`bash scripts/trigger-deploy.sh <user@host> [ref]` builds an artifact from **one commit** and sends
it over a single SSH session. The artifact is a `git archive` of an allow-list: `server.js`,
`package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `src/`, `public/`, `test/` and
`scripts/`. On the host, `deploy.sh` then runs these steps:

1. **Lock** (`flock`). Deployments never interleave. A commit older than the active one ends as
   `superseded` and is not activated (set `DEPLOY_ALLOW_OLDER=1` to override deliberately).
2. **Unpack** into `releases/<UTC-stamp>-<sha12>`. Every deploy gets a distinct directory.
3. **Validate.** Required runtime paths must be present and forbidden ones (`.env`, `.git`,
   `node_modules`, store documents, tooling trees) absent. `STORAGE_ROOT` and `AFM_DATA_DIR` must be
   existing absolute directories outside `/opt/dimension`. Once any release has run, the store must
   already exist; an empty `AFM_DATA_DIR` is refused rather than silently starting a blank store.
4. **Install** with `npm ci --omit=dev`, exactly as the lockfile says. The host needs to reach the npm
   registry.
5. **Gate on the suite:** `npm test`, unmodified, runs inside the release with the production
   variables withheld. It uses temp directories and port 0, never the store or the storage root.
   Output goes to `logs/test-<release>.log`.
6. **Activate atomically.** The `current` symlink is replaced by `rename(2)`, then
   `systemctl restart dimension` runs.
7. **Health-check** `http://127.0.0.1:$PORT/api/v1/health` for up to 60 s. The check requires
   `"success":true` and `"apiVersion":1` (`EXPECT_API_VERSION`).
8. **On failure, roll back automatically** to the previous release, restart, and check health again.
9. **Prune** down to 5 releases (`KEEP_RELEASES`). The active and previous releases are never removed.

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
reject a push**, so a commit whose suite fails on the host still reaches the remote but deploys
nowhere. The hook prints the outcome.

## Rollback

```bash
ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> rollback      # via the restricted key
sudo -u dimension-deploy bash /opt/dimension/bin/deploy.sh rollback  # on the host
```

This swaps `current` and `previous`, restarts and health-checks. It needs no rebuild, no install and
no network, and running it twice returns to where you started. Rollback restores **code only**: the
stores and `STORAGE_ROOT` are not touched. A schema migration in `admin.sqlite` is forward-only, so
check `docs/DATABASE.md` before rolling back across one.

**Rolling back across migration 6 (access/refresh session tokens)** needs the store too: an older
release refuses to start on a v6 database ("newer than this release understands"). Stop the
service, restore the `admin.sqlite` backup taken before the deploy, then roll back. **Every session
is invalidated** either way — the old code reads `afm_session`, which the new release never set —
so every operator signs in again. That is fail-closed, not a fault.

## Status and logs

- `ssh … status` or `bash /opt/dimension/bin/deploy.sh status` shows the active and previous
  releases, the retained list and the last outcome. The active commit is also in
  `current/.release-commit`.
- Application logs: `journalctl -u dimension` (`-f` to follow), including `morgan` request lines.
- Audit log of admin actions: Admin → Logs → Audit (stored in `admin.sqlite`).
- Suite-gate output: `/opt/dimension/logs/test-<release>.log`.

## Persistence, backup and restore

All state lives outside every release, so activation, rollback and pruning cannot affect it.

| What | Where | How to back up |
|---|---|---|
| Accounts, sessions, policies, audit log | `$AFM_DATA_DIR/admin.sqlite` | `sqlite3 /var/lib/dimension/admin.sqlite ".backup /backup/admin-$(date +%F).sqlite"` (consistent while running) |
| Download counts, stars, activity | `$AFM_DATA_DIR/metadata.json` | `cp --preserve` (replaced by rename, so a copy is always complete) |
| Settings page values | `$AFM_DATA_DIR/settings.json` | `cp --preserve` |
| The files | `STORAGE_ROOT` | Your usual file-level backup (rsync, snapshots) |

When a store file is created, the journal records `[store] First run: initialised an empty … store`.
If that line appears on a host that has run before, the store has been lost or relocated.

**Restore** with the service stopped. Never write into a live file in place:

```bash
systemctl stop dimension
install -o dimension -g dimension -m 0640 /backup/metadata-….json /var/lib/dimension/metadata.json.restore
mv /var/lib/dimension/metadata.json.restore /var/lib/dimension/metadata.json
install -o dimension -g dimension -m 0640 /backup/admin-….sqlite /var/lib/dimension/admin.sqlite
rm -f /var/lib/dimension/*.tmp
systemctl start dimension
```

**Lost the only admin password?** See `docs/DATABASE.md` → Operations. Alternatively, with the
service stopped, move `admin.sqlite` aside and boot once with the bootstrap pair set. This
discards all accounts, policies and the audit log.

## Restarts, timeouts and limits

| Component | Value | Why |
|---|---|---|
| App shutdown grace (`server.js`) | 30 s | `SIGTERM` stops new connections and drains in-flight transfers, then forces exit |
| systemd `TimeoutStopSec` | 45 s | Must exceed the app's grace, or systemd kills a draining process |
| nginx `proxy_read_timeout` / `client_body_timeout` | 600 s | Must exceed both |
| nginx `client_max_body_size` | 6g | Must stay **above** `UPLOAD_MAX_BYTES`. Raise both together. |
| nginx `client_body_buffer_size` / `http2_body_preread_size` | 4m | With `proxy_request_buffering off` this is the HTTP/2 per-stream upload window. Keep it ≥ bandwidth × RTT; the default capped uploads near 3 MB/s. |
| Session lifetime | 24 h | Fixed; sign in again afterwards |

**Known limit:** Node's `server.requestTimeout` defaults to **300 s**. An upload that takes longer
than 5 minutes to arrive is ended by the application whatever nginx allows. At about 17 MB/s a
5 GiB upload takes roughly 300 s.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `FATAL CONFIGURATION ERROR` in the journal, unit restarting | A value in `/etc/dimension/dimension.env` is unusable; the message names it. Fix the value and restart. |
| Login succeeds, then you land back on the sign-in page | The cookie was dropped. Over `https://` check that nginx sends `X-Forwarded-Proto $scheme`. Mixing `http://` and `https://` for the same host also does this. |
| Every admin request returns `500` from nginx | The htpasswd file is missing (step 8). |
| Admin pages say "Administrator access required" | The account has role `user`. Change it, or sign in as an admin. |
| Admin → File portal → Save returns `500` | The portal `.env` isn't writable by `dimension` (step 4), or `ReadWritePaths` names a different path. |
| `403 Path traversal detected` on a folder | The path goes through a symlink that points outside `STORAGE_ROOT`. This is refused by design. |
| `pre-activation-failed` … `test suite failed` | Read `logs/test-<release>.log`. Nothing was activated. |
| `pre-activation-failed` … `npm ci failed` | The lockfile is out of date, or the registry is unreachable from the host. |
| `pre-activation-failed` … `holds no store` | `AFM_DATA_DIR` points at an empty directory on a host that has run before. Point it back at the real store. |
| `rolled-back` | The new release did not answer `/api/v1/health` within 60 s. Check `journalctl -u dimension` around the deploy time. |
| `413` from nginx on a large upload | `client_max_body_size` is below `UPLOAD_MAX_BYTES`. |
| Browser uploads much slower than scp/sftp, normal with `curl --http1.1` | The HTTP/2 upload window is too small: `client_body_buffer_size` / `http2_body_preread_size` are missing or below bandwidth × RTT. |
| `\r: command not found` | A script arrived with CRLF line endings. `.gitattributes` pins LF for `*.sh`, `*.service`, `*.conf` and the hook; re-checkout. |

## Verification status (record honestly)

As of 2026-10-16:

- **The suite passes on Linux** (Docker `node:24`, Node 24.22.0, unprivileged user, no network):
  0 failures. The only skip is a test of Windows path spellings. It also passes on Windows 10,
  Node 24.15.0 (1099 tests).
- Earlier, on Windows only: startup validation, graceful shutdown, packaging, and `deploy.sh`'s
  pre-activation failures plus its install-and-suite gate inside a release.

**Not yet exercised on a real host:** atomic activation, rollback, pruning,
`systemd-analyze verify`, `nginx -t`, the firewall and persistence across real deploys. Watch the
first deploy (step 12) and one rollback before trusting the pipeline unattended.
