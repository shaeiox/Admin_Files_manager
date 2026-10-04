# CI/CD Guide — Dimension Files Manager

How code gets from `git push` to a running release, and how to get it back out again.

- **Host setup (one-time, as root):** [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)
- **Why it is built this way:** [`docs/decisions/ADR-008-production-deployment.md`](../docs/decisions/ADR-008-production-deployment.md)

> ⚠ **The API is unauthenticated** and CORS admits any origin (ADR-003). This pipeline deploys the
> service safely. It does **not** make it safe to expose publicly. Keep the host on a trusted network.

---

## The pipeline at a glance

```
 developer machine                Git server (bare repo)                  Linux host
 ─────────────────                ──────────────────────                  ──────────
 git push origin master ───────►  hooks/post-receive
                                    │ branch == deployBranch?
                                    ▼
                                  trigger-deploy.sh
                                    │ git archive <commit>, allow-list only
                                    │ verify: required paths present, nothing forbidden
                                    ▼
                                  ssh deploy-key  "receive <sha> <epoch>"  ── artifact on stdin ──►  deploy.sh
                                                                                                      │ 1 lock (flock)
                                                                                                      │ 2 unpack → releases/<UTC>-<sha12>
                                                                                                      │ 3 validate release + config
                                                                                                      │ 4 npm ci --omit=dev
                                                                                                      │ 5 npm test   ◄── THE GATE
                                                                                                      │ 6 switch `current` atomically
                                                                                                      │ 7 systemctl restart dimension
                                                                                                      │ 8 GET /api/v1/health → apiVersion 1
                                                                                                      │ 9 fail? → roll back automatically
                                                                                                      │10 prune to 5 releases
                                                                                                      ▼
                                  ◄──────────────────────── DEPLOY_OUTCOME=… ─────────────────────────┘
```

There is **no hosted CI service** (no GitHub/GitLab remote exists), so the **test gate runs on the
deploy host**, inside the release, before it can take traffic. A failing suite means the commit
still lands in the repository but **deploys nowhere**.

| File | Runs on | Job |
|---|---|---|
| `git-hooks/post-receive` | Git server | Reacts to pushes on the deployment branch |
| `trigger-deploy.sh` | Git server or your machine | Packages **one commit** and ships it over SSH |
| `deploy.sh` | Deploy host | Validates, tests, activates, health-checks, rolls back, prunes |
| `systemd/dimension.service` | Deploy host | Runs the app: unprivileged user, graceful stop, journal logging |
| `nginx/dimension.conf` | Deploy host | TLS, 6 GB body ceiling, 600 s timeouts, streaming |

All scripts are run as **`bash <script>`**, because the exec bit is not stored in this repository.
They are pinned to LF line endings by `.gitattributes`.

---

## Quick start

### 1. Prepare the host (once)

Follow [`docs/DEPLOYMENT.md` → First install](../docs/DEPLOYMENT.md#first-install-one-host), steps
1–9. When you finish, you have:

- `/opt/dimension/bin/deploy.sh` installed
- `/etc/dimension/dimension.env` with `STORAGE_ROOT`, `AFM_DATA_DIR` and `PORT`
- the systemd unit and nginx config installed and validated
- a `dimension-deploy` user whose SSH key is **locked to `deploy.sh`** (forced command)

### 2. Create a deploy key (on the Git server machine)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dimension_deploy -C dimension-deploy -N ""
```

Put the **public** key into `~dimension-deploy/.ssh/authorized_keys` on the host, prefixed with
the forced command from the runbook. The private key never goes into the repository.

Then check that the key can do exactly one thing:

```bash
ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> status
```

```bash
ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> ls
```

The first command prints the releases. The second must be refused.

### 3. First deploy, by hand and watched

```bash
SSH_OPTS="-i ~/.ssh/dimension_deploy" bash scripts/trigger-deploy.sh dimension-deploy@<host> master
```

The last line must read `DEPLOY_OUTCOME=success …`. Then check health from your machine:

```bash
curl -s https://<host>/api/v1/health
```

The response should include `"apiVersion":1`.

### 4. Install the push trigger (in the bare repository)

```bash
BARE=E:/GitServer/Admin-Files-Manager-fixed.git
cp scripts/git-hooks/post-receive "$BARE/hooks/post-receive"
cp scripts/trigger-deploy.sh      "$BARE/hooks/trigger-deploy.sh"
git -C "$BARE" config dimension.deployTarget dimension-deploy@<host>
git -C "$BARE" config dimension.deployBranch master
git -C "$BARE" config dimension.sshOpts      "-i C:/Users/<you>/.ssh/dimension_deploy"
```

Leave `dimension.deployTarget` unset to keep pushes from deploying, for example while setting up.
**Re-copy both files whenever they change in the repository.** The hook runs the installed copy,
not the pushed one.

### 5. Push

```bash
git push origin master
```

The deploy runs while the push is still finishing. Its output appears in your terminal, prefixed
with `remote:`, and ends with `DEPLOY_OUTCOME=…`.

---

## Everyday commands

| I want to… | Command |
|---|---|
| Deploy the branch tip | `git push origin master` (with the hook installed) |
| Deploy a specific commit by hand | `SSH_OPTS="-i ~/.ssh/dimension_deploy" bash scripts/trigger-deploy.sh dimension-deploy@<host> <sha>` |
| See what is running | `ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> status` |
| Roll back one release | `ssh -i ~/.ssh/dimension_deploy dimension-deploy@<host> rollback` |
| Build the artifact without deploying | `bash scripts/trigger-deploy.sh --package-only HEAD` |
| Inspect the artifact | `tar -tzf - < <path printed above>` |
| Read app logs (on the host) | `journalctl -u dimension -f` |
| Read the gate's test output (on the host) | `less /opt/dimension/logs/test-<release>.log` |

`rollback` swaps the active and previous releases, restarts and health-checks. It needs no rebuild
and no network. It restores **code only**: your files and the metadata/settings store are never
touched by a deploy or a rollback.

---

## Reading the outcome

Every run ends with one machine-readable line, also saved on the host as
`/opt/dimension/last-deploy.json`:

```
DEPLOY_OUTCOME=success release=20261004T120301Z-4d2c7e0f27ac commit=4d2c7e0f… previous=20261003T…
```

| Outcome | Exit | What happened | What to do |
|---|---|---|---|
| `success` | 0 | Activated and healthy | Nothing |
| `pre-activation-failed` | 2 | Stopped **before** switching; the old release is still serving | Read the `ERROR:` line (tests, `npm ci`, config, incomplete artifact) |
| `rolled-back` | 3 | Switched, failed restart or health, old release restored | Run `journalctl -u dimension` around the deploy time |
| `rollback-failed` | 4 | The restore also failed, or a first deploy failed with nothing to restore | **Act now:** the service may be down |
| `superseded` | 5 | A newer commit is already live; nothing changed | Nothing (`DEPLOY_ALLOW_OLDER=1` forces an older commit on purpose) |

Exit codes are stable, so wrappers and alerts can branch on them.

---

## What the gate checks

Before a release can take traffic:

1. **Artifact contents.** `server.js`, `src/routes/api.js`, the services, the four pages and
   `public/assets` must be present. `.env`, `.git`, `node_modules`, store documents and tooling
   trees must be absent.
2. **Configuration.**
   - `STORAGE_ROOT` and `AFM_DATA_DIR` must be existing absolute directories outside
     `/opt/dimension`.
   - Once the service has run, `AFM_DATA_DIR` must already contain the store. An empty directory
     is refused, so a blank store is never started silently.
3. **Dependencies.** `npm ci --omit=dev` must reproduce exactly what is in `package-lock.json`.
4. **Tests.** `npm test` must pass, unmodified, in the release. The suite uses only temp
   directories and port 0, so it never touches production data.

After the switch:

5. **Health.** `GET http://127.0.0.1:$PORT/api/v1/health` must answer `"success":true` and
   `"apiVersion":1` within 60 s.

### What ships in a release

Only the paths in an **allow-list** ship, taken from exactly one commit: `server.js`,
`package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `src/`, `public/`, `test/`,
`scripts/`. That is about 80 files and 300 KB. `test/` ships because the gate runs it on the host.
Docs, `openspec/`, `graphify-out/` and agent folders never ship.

---

## Writing code that keeps the pipeline green

- **Keep the suite hermetic.** It runs with **no `.env`** and **no dev dependencies**. A test may
  not rely on your local `.env`, a fixed port, or `nodemon`. Point stores and `STORAGE_ROOT` at
  temp directories, exactly as the existing suites do. To check locally, run the suite from a
  directory that has no `.env`:
  ```bash
  cd /tmp && env -u STORAGE_ROOT node --test "D:/Projects/Admin-Files-Manager-fixed/test/**/*.test.js"
  ```
- **Don't change `apiVersion` alone.** It is the activation check. If it changes, change
  `EXPECT_API_VERSION` in `deploy.sh` in the same commit, or every deploy rolls back.
- **No new dependency** without a deliberate decision. The guardrail test pins the manifest at
  seven production packages.
- **New runtime folder?** Add it to `INCLUDE_PATHS` in `trigger-deploy.sh` and, if it is required
  at runtime, to `REQUIRED_PATHS` in `deploy.sh`. Otherwise it silently won't ship.
- **New environment variable?** Validate it in `config.validateStartup()` (`src/config/env.js`).
  Document it in `.env.example` and in the `DEPLOYMENT.md` table.
- **Shell, unit or nginx files** stay LF (`.gitattributes`). If one shows `\r: command not found`
  on the host, it was checked out with CRLF.

---

## Timeouts and limits

| Layer | Value |
|---|---|
| App graceful shutdown (`server.js`) | 30 s |
| systemd `TimeoutStopSec` | 45 s |
| nginx read/body timeouts | 600 s |
| nginx `client_max_body_size` | 6 GB (keep it above `UPLOAD_MAX_BYTES`, default 5 GB) |

The ordering is load-bearing: each layer must outlast the one inside it.

> **Known limit:** Node's `server.requestTimeout` (300 s) ends any upload that takes longer than
> 5 minutes, regardless of nginx. It is not fixed by the pipeline. See ADR-008 → Consequences.

---

## Not set up yet / not verified

- **No hosted CI.** If a GitHub/GitLab remote is added later, a workflow can run `npm ci && npm test`
  on every push and PR and call `trigger-deploy.sh` from the deployment branch. The host-side gate
  stays either way.
- **Push is not blocked by tests.** A `post-receive` hook can't reject a push; it gates the
  deployment only. That is fine while one machine pushes. Add a `pre-receive` gate if that changes.
- **Verified on Windows only (2026-10-04):**
  - packaging
  - the pre-activation checks
  - the lockfile install
  - the suite gate inside a release (772/772)

  **Pending on a real Linux host:** the atomic switch, rollback, pruning, `systemd-analyze verify`,
  `nginx -t`, and the suite on Linux. Watch the first few deploys before relying on the hook
  unattended.
