#!/usr/bin/env bash
# scripts/deploy.sh - host-side release mechanism for Dimension Files Manager.
#
# Runs ON the deployment host. Knows nothing about git hosting or CI: it takes
# one release artifact plus the commit it was built from, and does
#   unpack -> validate -> install -> test -> switch -> restart -> health-check
#   -> (roll back on failure) -> prune
# (production-cicd-readiness D2, D3, D12; ADR-008; docs/DEPLOYMENT.md).
#
# Usage (always via bash - the exec bit is not recorded in this repository, D9):
#   bash deploy.sh deploy <artifact.tar.gz> <commit-sha> [commit-epoch]
#   bash deploy.sh receive <commit-sha> [commit-epoch] < artifact.tar.gz
#   bash deploy.sh rollback          # re-activate the previous release
#   bash deploy.sh status            # print the active and previous releases
#   bash deploy.sh ssh               # forced-command entry for the deploy key (reads $SSH_ORIGINAL_COMMAND)
#
# Outcome: the last line of output is machine-readable,
#   DEPLOY_OUTCOME=<outcome> release=<dir|-> commit=<sha|-> previous=<dir|->
# and the same is written as JSON to $APP_ROOT/last-deploy.json.
#   exit 0  success              - activated and healthy
#   exit 2  pre-activation-failed - never activated; the previous release still serves
#   exit 3  rolled-back          - activated, failed health/restart, previous restored
#   exit 4  rollback-failed      - activated, failed, AND the restore failed: page someone
#   exit 5  superseded           - an equal-or-newer commit is already active (not an error to retry)
#
# Configuration (environment, all optional; defaults match docs/DEPLOYMENT.md):
#   APP_ROOT        /opt/dimension               releases/, current, previous live here
#   ENV_FILE        /etc/dimension/dimension.env  the service's out-of-band configuration
#   SERVICE_NAME    dimension                    systemd unit name
#   SYSTEMCTL       "sudo -n systemctl"          how to restart the unit
#   KEEP_RELEASES   5                            retention cap (active + previous always kept)
#   HEALTH_TIMEOUT  60                           seconds to wait for a healthy restart
#   EXPECT_API_VERSION 1                         the apiVersion /admin/v1/health must report
#   SKIP_TESTS      0                            1 skips the suite gate (emergencies only; logged loudly)
#   DEPLOY_ALLOW_OLDER 0                         1 permits activating an older commit on purpose

set -Eeuo pipefail
umask 022

APP_ROOT="${APP_ROOT:-/opt/dimension}"
ENV_FILE="${ENV_FILE:-/etc/dimension/dimension.env}"
SERVICE_NAME="${SERVICE_NAME:-dimension}"
SYSTEMCTL="${SYSTEMCTL:-sudo -n systemctl}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
EXPECT_API_VERSION="${EXPECT_API_VERSION:-1}"
SKIP_TESTS="${SKIP_TESTS:-0}"
DEPLOY_ALLOW_OLDER="${DEPLOY_ALLOW_OLDER:-0}"

RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
PREVIOUS="$APP_ROOT/previous"
LOCK_FILE="$APP_ROOT/.deploy.lock"

# Paths a release must contain, and paths it must never contain (D3, deployment-artifact).
REQUIRED_PATHS=(
    server.js package.json package-lock.json
    src/config/env.js src/routes/api.js src/services src/controllers src/middlewares src/utils
    public/index.html public/files.html public/uploads.html public/settings.html
    public/assets/js/api.js public/assets/css
)
FORBIDDEN_PATHS=(.env .git node_modules graphify-out openspec temp download .claude data/metadata.json data/settings.json)

log()  { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; }

OUTCOME_RELEASE="-"; OUTCOME_COMMIT="-"; OUTCOME_PREVIOUS="-"
ACTIVATED=0

# Emit the machine-readable outcome and exit with its code.
finish() {
    local outcome="$1" code="$2"
    [[ -n "${RECEIVED_ARTIFACT:-}" ]] && rm -f "$RECEIVED_ARTIFACT"
    printf '{"outcome":"%s","release":"%s","commit":"%s","previous":"%s","at":"%s"}\n' \
        "$outcome" "$OUTCOME_RELEASE" "$OUTCOME_COMMIT" "$OUTCOME_PREVIOUS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > "$APP_ROOT/last-deploy.json" 2>/dev/null || true
    printf '%s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$outcome" "$OUTCOME_RELEASE" "$OUTCOME_COMMIT" \
        >> "$APP_ROOT/deployments.log" 2>/dev/null || true
    echo "DEPLOY_OUTCOME=$outcome release=$OUTCOME_RELEASE commit=$OUTCOME_COMMIT previous=$OUTCOME_PREVIOUS"
    exit "$code"
}

# Read one KEY from the systemd EnvironmentFile WITHOUT sourcing it (no code execution).
env_value() {
    local key="$1" line value=""
    [[ -r "$ENV_FILE" ]] || { echo ""; return; }
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^[[:space:]]*# || -z "${line// }" ]] && continue
        if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}=(.*)$ ]]; then
            value="${BASH_REMATCH[2]}"
            value="${value#\"}"; value="${value%\"}"; value="${value#\'}"; value="${value%\'}"
        fi
    done < "$ENV_FILE"
    echo "$value"
}

# The release directory a pointer resolves to, or empty.
target_of() { [[ -L "$1" ]] && readlink "$1" || true; }

# Point $1 at $2 atomically: build the new link beside it, then rename(2) over it.
# There is never a moment in which the pointer is absent (release-lifecycle).
atomic_link() {
    local link="$1" target="$2" tmp
    tmp="$link.tmp.$$"
    ln -sfn "$target" "$tmp"
    mv -Tf "$tmp" "$link"
}

restart_service() {
    log "Restarting $SERVICE_NAME"
    # shellcheck disable=SC2086  # SYSTEMCTL is deliberately word-split ("sudo -n systemctl").
    $SYSTEMCTL restart "$SERVICE_NAME"
}

# Poll the versioned health endpoint until it reports the expected API version.
health_ok() {
    local port url deadline body
    port="$(env_value PORT)"; port="${port:-3000}"
    url="http://127.0.0.1:${port}/admin/v1/health"
    deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
    log "Waiting up to ${HEALTH_TIMEOUT}s for $url to report apiVersion $EXPECT_API_VERSION"
    while (( $(date +%s) < deadline )); do
        if body="$(curl -fsS --max-time 3 "$url" 2>/dev/null)" \
            && [[ "$body" == *'"success":true'* && "$body" == *"\"apiVersion\":${EXPECT_API_VERSION}"[,\}]* ]]; then
            log "Healthy: $body"
            return 0
        fi
        sleep 2
    done
    fail "Health check did not pass within ${HEALTH_TIMEOUT}s (last body: ${body:-<none>})"
    return 1
}

# Remove old releases beyond the cap. Never touches the active or previous release,
# and never fails the deployment (release-lifecycle: retention).
prune() {
    local active previous keep=() dir name count=0
    active="$(basename "$(target_of "$CURRENT")" 2>/dev/null || true)"
    previous="$(basename "$(target_of "$PREVIOUS")" 2>/dev/null || true)"
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        count=$((count + 1))
        if (( count <= KEEP_RELEASES )) || [[ "$name" == "$active" || "$name" == "$previous" ]]; then
            keep+=("$name"); continue
        fi
        dir="$RELEASES/$name"
        if chmod -R u+w "$dir" 2>/dev/null && rm -rf -- "$dir"; then
            log "Pruned release $name"
        else
            log "WARNING: could not prune $name (deployment unaffected)"
        fi
    done < <(ls -1 "$RELEASES" 2>/dev/null | sort -r)
    log "Retained ${#keep[@]} release(s) (cap $KEEP_RELEASES; active=$active previous=${previous:--})"
}

cmd_status() {
    echo "active:   $(target_of "$CURRENT")"
    echo "previous: $(target_of "$PREVIOUS")"
    echo "releases: $(ls -1 "$RELEASES" 2>/dev/null | sort -r | tr '\n' ' ')"
    [[ -f "$APP_ROOT/last-deploy.json" ]] && echo "last:     $(cat "$APP_ROOT/last-deploy.json")"
    return 0
}

# Single-command rollback: previous -> active, using only what is on the host.
cmd_rollback() {
    local active previous
    active="$(target_of "$CURRENT")"; previous="$(target_of "$PREVIOUS")"
    OUTCOME_RELEASE="$(basename "${previous:--}")"; OUTCOME_PREVIOUS="$(basename "${active:--}")"
    if [[ -z "$previous" || ! -d "$previous" ]]; then
        fail "No previous release to roll back to."
        finish "rollback-failed" 4
    fi
    log "Rolling back: $(basename "$active") -> $(basename "$previous")"
    atomic_link "$CURRENT" "$previous"
    [[ -n "$active" ]] && atomic_link "$PREVIOUS" "$active"
    if restart_service && health_ok; then
        finish "rolled-back" 0
    fi
    fail "The rolled-back release is not healthy either."
    finish "rollback-failed" 4
}

cmd_deploy() {
    local artifact="${1:-}" commit="${2:-}" epoch="${3:-}"
    [[ -n "$artifact" && -n "$commit" ]] || { echo "usage: bash deploy.sh deploy <artifact.tar.gz> <commit-sha> [commit-epoch]" >&2; exit 64; }
    [[ "$commit" =~ ^[0-9a-fA-F]{7,40}$ ]] || { fail "commit must be a hex SHA (got '$commit')"; finish "pre-activation-failed" 2; }
    OUTCOME_COMMIT="$commit"

    local stamp release_name release previous_target
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    release_name="${stamp}-${commit:0:12}"
    release="$RELEASES/$release_name"
    OUTCOME_RELEASE="$release_name"
    previous_target="$(target_of "$CURRENT")"
    OUTCOME_PREVIOUS="$(basename "${previous_target:--}")"

    # A stale deployment must not roll the service backwards over a newer one.
    if [[ -n "$epoch" && "$DEPLOY_ALLOW_OLDER" != "1" && -n "$previous_target" && -f "$previous_target/.release-epoch" ]]; then
        local active_epoch
        active_epoch="$(cat "$previous_target/.release-epoch")"
        if [[ "$epoch" =~ ^[0-9]+$ && "$active_epoch" =~ ^[0-9]+$ ]] && (( epoch < active_epoch )); then
            log "Commit $commit (epoch $epoch) is older than the active release (epoch $active_epoch); not activating."
            finish "superseded" 5
        fi
    fi

    # Anything below that fails before the switch removes the half-built release.
    cleanup_unactivated() { (( ACTIVATED )) || { chmod -R u+w "$release" 2>/dev/null; rm -rf -- "$release"; }; }
    trap cleanup_unactivated EXIT

    log "Deploying $commit as $release_name (previous: ${OUTCOME_PREVIOUS})"
    [[ -f "$artifact" ]] || { fail "artifact not found: $artifact"; finish "pre-activation-failed" 2; }
    mkdir -p "$RELEASES"
    mkdir "$release"
    tar -xzf - -C "$release" < "$artifact" || { fail "artifact could not be unpacked"; finish "pre-activation-failed" 2; }

    # 1. Completeness: a release that unpacks but lacks public/ would pass /health and serve a broken UI.
    local p missing=0
    for p in "${REQUIRED_PATHS[@]}"; do
        [[ -e "$release/$p" ]] || { fail "release is incomplete: missing $p"; missing=1; }
    done
    (( missing )) && finish "pre-activation-failed" 2
    for p in "${FORBIDDEN_PATHS[@]}"; do
        [[ -e "$release/$p" ]] && { fail "release contains a forbidden path: $p"; finish "pre-activation-failed" 2; }
    done

    # 2. Configuration prerequisites (runtime-configuration, persistent-state).
    [[ -r "$ENV_FILE" ]] || { fail "configuration file not readable: $ENV_FILE"; finish "pre-activation-failed" 2; }
    local storage_root data_dir
    storage_root="$(env_value STORAGE_ROOT)"; data_dir="$(env_value AFM_DATA_DIR)"
    [[ "$storage_root" == /* && -d "$storage_root" ]] || { fail "STORAGE_ROOT is not an existing absolute directory: '${storage_root}'"; finish "pre-activation-failed" 2; }
    [[ "$data_dir" == /* && -d "$data_dir" ]] || { fail "AFM_DATA_DIR is not an existing absolute directory: '${data_dir}'"; finish "pre-activation-failed" 2; }
    case "$data_dir/" in "$APP_ROOT"/*) fail "AFM_DATA_DIR must live outside $APP_ROOT (releases are pruned)"; finish "pre-activation-failed" 2;; esac
    case "$storage_root/" in "$APP_ROOT"/*) fail "STORAGE_ROOT must live outside $APP_ROOT"; finish "pre-activation-failed" 2;; esac
    # A store expected to exist (any release has run before) but absent is a misconfiguration,
    # not a first run: activating would silently start an empty store.
    if [[ -n "$previous_target" && ! -f "$data_dir/metadata.json" && ! -f "$data_dir/settings.json" ]]; then
        fail "AFM_DATA_DIR ($data_dir) holds no store although a release has run before - refusing to start an empty store"
        finish "pre-activation-failed" 2
    fi

    # 3. Production dependencies, exactly as locked; dev dependencies omitted.
    log "Installing production dependencies (npm ci --omit=dev)"
    ( cd "$release" && npm ci --omit=dev --no-audit --no-fund --loglevel=error ) \
        || { fail "npm ci failed (lockfile out of date, or registry unreachable)"; finish "pre-activation-failed" 2; }

    # 4. The project's own suite, unmodified, on THIS host. It redirects every store and
    #    STORAGE_ROOT to temp trees and binds port 0, so production state is untouched;
    #    production variables are withheld so they cannot leak in.
    if [[ "$SKIP_TESTS" == "1" ]]; then
        log "WARNING: SKIP_TESTS=1 - the suite gate was NOT run for this release"
    else
        # The log lives outside releases/ so pruning never mistakes it for a release.
        local test_log="$APP_ROOT/logs/test-$release_name.log"
        mkdir -p "$APP_ROOT/logs"
        log "Running the test suite (npm test) in the release"
        ( cd "$release" && env -u STORAGE_ROOT -u AFM_DATA_DIR -u NODE_ENV -u PORT -u UPLOAD_MAX_BYTES npm test ) \
            > "$test_log" 2>&1 \
            || { fail "test suite failed - full output in $test_log"; tail -n 30 "$test_log" || true; finish "pre-activation-failed" 2; }
        log "Suite passed: $(grep -aE '(tests|pass|fail) [0-9]+$' "$test_log" | tr '\n' ' ')"
    fi
    [[ -n "$epoch" ]] && echo "$epoch" > "$release/.release-epoch"
    echo "$commit" > "$release/.release-commit"
    # Immutable from here on (the service identity never owns it; this also stops the owner editing in place).
    chmod -R a-w "$release"

    # 5. Activate atomically, then restart and verify. From here a failure rolls back.
    atomic_link "$CURRENT" "$release"
    ACTIVATED=1
    trap - EXIT
    log "Activated $release_name"

    if restart_service && health_ok; then
        [[ -n "$previous_target" ]] && atomic_link "$PREVIOUS" "$previous_target"
        prune || log "WARNING: pruning failed (deployment unaffected)"
        finish "success" 0
    fi

    fail "Activation of $release_name failed; restoring the previous release"
    if [[ -z "$previous_target" ]]; then
        fail "There is no previous release (first deployment); the service is left on the failed release, stopped state unknown"
        finish "rollback-failed" 4
    fi
    atomic_link "$CURRENT" "$previous_target"
    if restart_service && health_ok; then
        finish "rolled-back" 3
    fi
    fail "Rollback to $(basename "$previous_target") is ALSO unhealthy - original failure: activation of $release_name"
    finish "rollback-failed" 4
}

# `receive <commit> [epoch]`: the artifact arrives on stdin (one SSH session, no scp step).
cmd_receive() {
    local commit="${1:-}" epoch="${2:-}" tmp
    [[ "$commit" =~ ^[0-9a-fA-F]{7,40}$ ]] || { echo "usage: bash deploy.sh receive <commit-sha> [commit-epoch] < artifact.tar.gz" >&2; exit 64; }
    tmp="$(mktemp "${TMPDIR:-/tmp}/dimension-artifact.XXXXXX")"
    RECEIVED_ARTIFACT="$tmp"   # removed by finish(), which every path exits through
    cat > "$tmp"
    [[ -s "$tmp" ]] || { fail "no artifact received on stdin"; OUTCOME_COMMIT="$commit"; finish "pre-activation-failed" 2; }
    cmd_deploy "$tmp" "$commit" "$epoch"
}

# Forced-command entry point for the deploy key (authorized_keys:
#   command="bash /opt/dimension/bin/deploy.sh ssh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 ...)
# The key can do exactly three things; nothing else from $SSH_ORIGINAL_COMMAND runs.
cmd_ssh() {
    local -a words
    read -r -a words <<< "${SSH_ORIGINAL_COMMAND:-}"
    case "${words[0]:-}" in
        receive)
            [[ ${#words[@]} -le 3 && "${words[1]:-}" =~ ^[0-9a-fA-F]{7,40}$ && "${words[2]:-0}" =~ ^[0-9]+$ ]] \
                || { echo "refused: receive <sha> [epoch]" >&2; exit 64; }
            take_lock; cmd_receive "${words[1]}" "${words[2]:-}" ;;
        rollback) [[ ${#words[@]} -eq 1 ]] || exit 64; take_lock; cmd_rollback ;;
        status)   [[ ${#words[@]} -eq 1 ]] || exit 64; cmd_status ;;
        *) echo "refused: only 'receive <sha> [epoch]', 'rollback' and 'status' are permitted" >&2; exit 64 ;;
    esac
}

# Serialise every mutating command: deployments never interleave (release-lifecycle).
take_lock() {
    exec 9>"$LOCK_FILE"
    if ! flock -w "${LOCK_WAIT:-1800}" 9; then
        fail "another deployment holds $LOCK_FILE"; finish "pre-activation-failed" 2
    fi
}

# Any unexpected failure still ends in a machine-readable outcome.
on_error() {
    local rc=$?
    trap - ERR
    fail "unexpected failure (exit $rc): ${BASH_COMMAND}"
    if (( ACTIVATED )); then finish "rollback-failed" 4; else finish "pre-activation-failed" 2; fi
}
trap on_error ERR

main() {
    local cmd="${1:-}"; shift || true
    mkdir -p "$APP_ROOT"
    case "$cmd" in
        deploy)   take_lock; cmd_deploy "$@" ;;
        receive)  take_lock; cmd_receive "$@" ;;
        rollback) take_lock; cmd_rollback ;;
        status)   cmd_status ;;
        ssh)      cmd_ssh ;;
        *) echo "usage: bash deploy.sh {deploy <artifact> <commit> [epoch] | receive <commit> [epoch] | rollback | status | ssh}" >&2; exit 64 ;;
    esac
}

main "$@"
