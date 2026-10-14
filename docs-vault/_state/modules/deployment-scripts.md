---
module: Deployment Scripts
slug: deployment-scripts
purpose: Package one commit, ship it over SSH, and atomically activate, health-check and roll back releases on the host.
roots:
  - scripts/
language: bash
complexity: medium
loc: 931
files:
  - scripts/deploy.sh
  - scripts/trigger-deploy.sh
  - scripts/git-hooks/post-receive
  - scripts/systemd/dimension.service
  - scripts/nginx/dimension.conf
  - scripts/nginx/cloudavid.conf
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
A two-sided shell pipeline plus host configuration files. The **source side** (`trigger-deploy.sh`, optionally invoked from the bare repository's `git-hooks/post-receive`) resolves a ref to one commit, builds a `git archive` tar.gz restricted to an allow-list of runtime paths (`server.js package.json package-lock.json .nvmrc .gitignore src public test scripts`), verifies it against a forbidden-path regex and a required-file list, then streams it over a single SSH session to the host. The **host side** (`deploy.sh`) is a subcommand dispatcher (`deploy | receive | rollback | status | ssh`) implementing a linear release lifecycle: unpack into `$APP_ROOT/releases/<UTCstamp>-<sha12>` -> validate required/forbidden paths -> validate config prerequisites read from `/etc/dimension/dimension.env` -> `npm ci --omit=dev` -> run `npm test` in the release with production env vars unset -> make the release read-only -> atomically swap the `current` symlink -> `systemctl restart` -> poll `/api/v1/health` for `apiVersion` -> on success update `previous` and prune, on failure restore `previous` and restart. Control exits only through `finish()`, which writes `last-deploy.json`, appends `deployments.log`, prints a `DEPLOY_OUTCOME=` line and exits with a coded status (0/2/3/4/5). The remaining files are static host configuration: a hardened systemd unit running `node server.js` from `/opt/dimension/current`, a generic TLS reverse-proxy vhost (`dimension.conf`), and a two-domain CloudAvid vhost (`cloudavid.conf`: static portal plus basic-auth-gated reverse proxy to the app).

<!-- c2d:s2 -->
### Public API
```
bash scripts/deploy.sh deploy <artifact.tar.gz> <commit-sha> [commit-epoch]
```
Deploy a local artifact file as a new release (takes the lock).
```
bash scripts/deploy.sh receive <commit-sha> [commit-epoch] < artifact.tar.gz
```
Same as deploy, artifact read from stdin into a temp file.
```
bash scripts/deploy.sh rollback
```
Swap `current` back to `previous`, restart, health-check.
```
bash scripts/deploy.sh status
```
Print active/previous release, release list, and `last-deploy.json`.
```
bash scripts/deploy.sh ssh   # reads $SSH_ORIGINAL_COMMAND
```
Forced-command entry for the deploy key; permits only `receive <sha> [epoch]`, `rollback`, `status`.
```
DEPLOY_OUTCOME=<outcome> release=<dir|-> commit=<sha|-> previous=<dir|->
```
Machine-readable last line; exit codes 0 success, 2 pre-activation-failed, 3 rolled-back, 4 rollback-failed, 5 superseded, 64 usage.
```
$APP_ROOT/last-deploy.json  {"outcome","release","commit","previous","at"}
```
Outcome record written on every exit.
```
bash scripts/trigger-deploy.sh <ssh-target> [ref]
bash scripts/trigger-deploy.sh --package-only [ref]
```
Package one commit and ship it (`ssh $SSH_OPTS -o BatchMode=yes <target> "${REMOTE_CMD:-receive} <sha> <epoch>"`), or only build and print the artifact path.
```
scripts/git-hooks/post-receive   (git config: dimension.deployTarget, dimension.deployBranch, dimension.sshOpts)
```
Bare-repo hook that calls `trigger-deploy.sh` for pushes to the deployment branch; always exits 0.
```
Environment (deploy.sh): APP_ROOT, ENV_FILE, SERVICE_NAME, SYSTEMCTL, KEEP_RELEASES, HEALTH_TIMEOUT,
  EXPECT_API_VERSION, SKIP_TESTS, DEPLOY_ALLOW_OLDER, LOCK_WAIT
Environment (trigger-deploy.sh): GIT_DIR, SSH_OPTS, OUT_DIR, REMOTE_CMD
```
Tunables with defaults documented in script headers.
```
systemd unit "dimension" (scripts/systemd/dimension.service); nginx upstream dimension_app -> 127.0.0.1:3000
```
Host integration points consumed by deploy.sh (`systemctl restart dimension`) and the proxy.

<!-- c2d:s3 -->
### Internal Patterns
- **Single exit funnel:** every path ends in `finish outcome code`; an `ERR` trap (`on_error`) maps unexpected failures to `pre-activation-failed` or `rollback-failed` depending on the `ACTIVATED` flag.
- **Cleanup trap for half-built releases:** an `EXIT` trap (`cleanup_unactivated`) deletes the release directory unless activation happened; it is cleared after the symlink swap.
- **Atomic pointer swap:** `atomic_link` creates `link.tmp.$$` with `ln -sfn` then `mv -Tf` over the real link (rename(2)), so `current`/`previous` are never absent.
- **Serialisation via flock:** `take_lock` opens fd 9 on `$APP_ROOT/.deploy.lock` and waits up to `LOCK_WAIT` (default 1800 s); `status` is lock-free.
- **Non-executing env parsing:** `env_value` reads one key from the systemd EnvironmentFile line by line with a regex, stripping CR, `export`, and surrounding quotes, without sourcing it.
- **Stale-commit guard:** commit epoch is written to `.release-epoch`; an older epoch than the active release yields `superseded` (exit 5) unless `DEPLOY_ALLOW_OLDER=1`.
- **Defence in depth on contents:** allow-list `git archive` plus forbidden-pattern check on the source side; `REQUIRED_PATHS` / `FORBIDDEN_PATHS` checks again on the host.
- **Config sanity gates:** `STORAGE_ROOT` and `AFM_DATA_DIR` must be existing absolute dirs outside `APP_ROOT`; an empty data dir after a prior release is refused.
- **Hermetic test gate:** `env -u STORAGE_ROOT -u AFM_DATA_DIR -u NODE_ENV -u PORT -u UPLOAD_MAX_BYTES npm test`, log kept in `$APP_ROOT/logs/` (outside `releases/` so pruning ignores it); `SKIP_TESTS=1` bypasses with a warning.
- **Immutability:** `chmod -R a-w` on the release before activation; pruning re-adds `u+w` before `rm -rf`.
- **Retention:** newest `KEEP_RELEASES` by reverse-sorted name, always keeping active and previous; prune failures never fail the deploy.
- **Forced-command whitelist:** `cmd_ssh` word-splits `$SSH_ORIGINAL_COMMAND` with `read -a` and validates arity and hex/numeric arguments before dispatching.
- **Timeout ordering contract:** app shutdown grace 30 s < systemd `TimeoutStopSec=45s` < nginx `proxy_read_timeout 600s`; nginx `client_max_body_size 6g` sits above the app's 5 GiB `UPLOAD_MAX_BYTES` default, with request/response buffering off for streaming.
- Deliberate word-splitting of `SYSTEMCTL` and `SSH_OPTS` (shellcheck SC2086 disabled inline).

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - **Server Bootstrap and Config** — `server.js` is the `ExecStart` target and a required release path; relies on its env contract (`STORAGE_ROOT`, `AFM_DATA_DIR`, `PORT`, `NODE_ENV`, `UPLOAD_MAX_BYTES`), `src/config/env.js`, and its 30 s shutdown grace.
   - **HTTP API Layer** — `GET /api/v1/health` (must return `"success":true` and `"apiVersion":<EXPECT_API_VERSION>`) is the activation gate; `src/routes/api.js` is a required release path.
   - Required release paths also name `src/services`, `src/controllers`, `src/middlewares`, `src/utils`, and `public/*.html`, `public/assets/js/api.js`, `public/assets/css` (presence checks only), and the stores `data/metadata.json` / `data/settings.json` (must be absent from a release; their presence in `AFM_DATA_DIR` is checked).
2. **Third-party packages / host tools**
   - npm (`npm ci --omit=dev`, `npm test`) and Node.js (`/usr/bin/node`).
   - git (`rev-parse`, `show`, `cat-file`, `archive`, `config`).
   - OpenSSH client (`ssh -o BatchMode=yes`) and server forced-command (`SSH_ORIGINAL_COMMAND`).
   - systemd (`systemctl` via `sudo -n`), util-linux `flock`, GNU coreutils/tar (`mv -T`, `readlink`, `tar -xzf`), curl (health polling).
   - nginx (TLS termination, reverse proxy, basic auth for the CloudAvid admin vhost).

<!-- c2d:s5 -->
### Complexity
Medium. The code is linear shell with no deep abstraction, but `deploy.sh` carries real state-machine logic: interacting `ERR` and `EXIT` traps, an `ACTIVATED` flag that flips the failure classification, file locking, symlink atomicity, epoch-based supersession, and a rollback path that can itself fail. The most complex unit is `cmd_deploy` in `scripts/deploy.sh` (~107 lines, roughly 25 branch points): it threads validation, config checks, dependency install, the test gate, activation, health polling, and two-tier recovery through a single function whose correctness depends on trap ordering and every exit going through `finish`. `cloudavid.conf` is long but declarative.

<!-- c2d:s6 -->
### Key Files
- `scripts/deploy.sh` — host-side release lifecycle: validate, install, test, activate, health-check, roll back, prune, and the SSH forced-command dispatcher.
- `scripts/trigger-deploy.sh` — builds the allow-listed `git archive` artifact for one commit, verifies it, and streams it to the host over SSH.
- `scripts/git-hooks/post-receive` — bare-repo hook that triggers a deployment for pushes to the configured branch.
- `scripts/systemd/dimension.service` — hardened systemd unit running `node server.js` from the `current` symlink with the out-of-band env file.
- `scripts/nginx/dimension.conf` — generic TLS reverse proxy to 127.0.0.1:3000 with streaming and timeout settings matched to the app.
- `scripts/nginx/cloudavid.conf` — two-domain vhost: static portal for files.cloudavid.com and basic-auth-gated proxy for admin.files.cloudavid.com.

<!-- c2d:s7 -->
### Limitations & Improvements

1. **Bug or Risk — `rm -rf` of a caller-supplied `OUT_DIR` in ship mode** (`scripts/trigger-deploy.sh` 46-48, 79; severity: medium).
   `OUT_DIR` is documented as the `--package-only` output location, but it is honoured in ship mode too, and line 79 then deletes the whole directory unconditionally. With `OUT_DIR=.` or `OUT_DIR=~/builds` exported in the shell, a normal deploy recursively deletes that directory and everything else in it. Only remove a directory the script created itself (and remove just the artifact otherwise).
   ```bash
   # before
   out_dir="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/dimension-pkg.XXXXXX")}"
   ...
   rm -rf -- "$out_dir"
   # after
   if [[ -n "${OUT_DIR:-}" ]]; then out_dir="$OUT_DIR"; own_dir=0
   else out_dir="$(mktemp -d "${TMPDIR:-/tmp}/dimension-pkg.XXXXXX")"; own_dir=1; fi
   ...
   if (( own_dir )); then rm -rf -- "$out_dir"; else rm -f -- "$artifact"; fi
   ```

2. **Bug or Risk — manual rollback does not restore on failure and misreports its outcome** (`scripts/deploy.sh` 166-182, 330-335; severity: medium).
   `cmd_rollback` swaps `current`/`previous` and restarts; if the target is unhealthy it exits `rollback-failed` but leaves the service on the unhealthy release, even when the release it replaced was healthy. It never sets `ACTIVATED=1`, so an unexpected error after the first `atomic_link` is reported by `on_error` as `pre-activation-failed` although the pointers were already moved. A successful manual rollback also exits `0` with outcome `rolled-back`, while the header documents `rolled-back` as exit `3`. Fix: set `ACTIVATED=1` once the link moves, and on a failed health check re-point `current` to the original `active`, restart, and only then report.
   ```bash
   atomic_link "$CURRENT" "$previous"; ACTIVATED=1
   [[ -n "$active" ]] && atomic_link "$PREVIOUS" "$active"
   if restart_service && health_ok; then finish "rolled-back" 0; fi
   if [[ -n "$active" ]]; then
       atomic_link "$CURRENT" "$active"; atomic_link "$PREVIOUS" "$previous"
       restart_service && health_ok && { fail "target unhealthy; original release restored"; finish "rollback-failed" 4; }
   fi
   ```
   (and document that exit 0 / `rolled-back` is the manual-rollback success code.)

3. **Limitation — systemd write allow-list is hard-coded, independent of the validated config** (`scripts/systemd/dimension.service` 52-54; `scripts/deploy.sh` 229-235; severity: medium).
   `ProtectSystem=strict` with `ReadWritePaths=/var/lib/dimension /srv/dimension/storage` makes every other path read-only for the service. `deploy.sh` accepts any existing absolute `STORAGE_ROOT`/`AFM_DATA_DIR` from the env file, and `/api/v1/health` performs no write, so a host configured with different paths activates "healthy" and then fails every upload/metadata write at runtime. Either have `deploy.sh` check that both paths fall under the unit's `ReadWritePaths` (e.g. `systemctl show -p ReadWritePaths "$SERVICE_NAME"`), or document the paths as fixed and refuse others.

4. **Bug or Risk — failed releases occupy retention slots** (`scripts/deploy.sh` 137-155, 269-290; severity: low).
   After a rolled-back or rollback-failed deploy, the failed release is left on disk (the `EXIT` cleanup trap is cleared on activation) and `prune` is not run. Because pruning keeps the newest `KEEP_RELEASES` names, repeated failures are retained as the "newest" while older known-good releases (other than active/previous) are pruned on the next success. Remove the failed release after a successful restore (`chmod -R u+w "$release"; rm -rf -- "$release"`), or exclude failed releases from the retained count.

5. **Improvement Opportunity — "superseded" contract differs from the code** (`scripts/deploy.sh` 24, 202; severity: low).
   The header says exit 5 means "an equal-or-newer commit is already active", but the guard is `(( epoch < active_epoch ))`, so an equal epoch (redeploy of the same commit, or another commit with the same committer second) proceeds. Align the comment ("a newer commit is already active") or the comparison, whichever is intended.

6. **Bug or Risk — epoch is unvalidated on the `deploy`/`receive` paths** (`scripts/deploy.sh` 185, 199-202, 263, 294-301; severity: low).
   Only `cmd_ssh` checks that the epoch is numeric. Via `bash deploy.sh deploy <artifact> <sha> <junk>` the value is written to `.release-epoch`; every later comparison then fails the `^[0-9]+$` test and the stale-commit guard is silently disabled while that release is active. Validate it next to the SHA check:
   ```bash
   [[ -z "$epoch" || "$epoch" =~ ^[0-9]+$ ]] || { fail "commit-epoch must be numeric (got '$epoch')"; finish "pre-activation-failed" 2; }
   ```

7. **Improvement Opportunity — containment check is lexical, not canonical** (`scripts/deploy.sh` 234-235; severity: low).
   `case "$data_dir/" in "$APP_ROOT"/*)` compares raw strings, so a `..` segment or a symlink pointing into `$APP_ROOT/releases` passes the "must live outside APP_ROOT" rule, and the store could then be pruned with a release. Compare canonical paths: `real="$(realpath -e -- "$data_dir")"; case "$real/" in "$(realpath -e -- "$APP_ROOT")"/*) ...`.

8. **Improvement Opportunity — `SSH_OPTS` relies on unquoted word-splitting** (`scripts/trigger-deploy.sh` 77-78; `scripts/git-hooks/post-receive` 25; severity: low).
   The deliberate unquoted `${SSH_OPTS}` also undergoes pathname expansion and breaks any key path containing spaces (the hook takes the value straight from `dimension.sshOpts`). Prefer `read -r -a ssh_opts <<< "${SSH_OPTS:-}"` with `ssh "${ssh_opts[@]}" ...`, or recommend an `~/.ssh/config` host alias so no options need passing.

9. **Improvement Opportunity — package directory leaks on failure** (`scripts/trigger-deploy.sh` 46-65, 79; severity: low).
   Every `die` between packaging and line 79 (archive failure, forbidden path, missing file) exits without removing the `mktemp -d` directory, so failed runs accumulate artifacts in `$TMPDIR`. Register the cleanup with an `EXIT` trap once the directory is created (respecting item 1's ownership rule).

10. **Bug or Risk — lock timeout clobbers the outcome record of the running deploy** (`scripts/deploy.sh` 71-80, 322-326; severity: low).
    When `flock -w` times out, `finish` runs without the lock and overwrites `last-deploy.json` (and appends to `deployments.log`) with `pre-activation-failed release=- commit=-`, while the deployment holding the lock is still in progress; `status` then reports a failure that belongs to no release. On lock timeout, print the outcome line and exit without touching the shared records (or use a distinct `lock-timeout` outcome).

11. **Bug or Risk — start-limit directive in the wrong section** (`scripts/systemd/dimension.service` 32-33; severity: low).
    `StartLimitIntervalSec=` is a `[Unit]` setting; in `[Service]` systemd only accepts the legacy `StartLimitInterval=`/`StartLimitBurst=` names, so `StartLimitIntervalSec=300` is ignored with an "Unknown key" warning and the default 10 s interval applies. Move both lines to `[Unit]`.

12. **Limitation — deployment runs synchronously inside the push** (`scripts/git-hooks/post-receive` 28-42; `scripts/deploy.sh` 322-324; severity: low).
    The hook ships and deploys before returning, so the pushing client waits for the lock (up to `LOCK_WAIT`, default 1800 s), `npm ci`, the full test suite and the health wait; an interrupted push session can cut the SSH stream mid-deploy. Acceptable for one pusher as documented; detach the trigger (background with output to a log) if pushes become frequent.
