#!/usr/bin/env bash
# scripts/trigger-deploy.sh - package ONE commit and hand it to the host's deploy.sh.
#
# Runs where the repository is: a developer checkout, or the bare repository's
# post-receive hook (scripts/git-hooks/post-receive). Never on the deploy host.
# (production-cicd-readiness D2, D3, D8; docs/DEPLOYMENT.md)
#
# Usage (via bash - the exec bit is not recorded in this repository):
#   bash scripts/trigger-deploy.sh <ssh-target> [ref]       # package, ship, deploy (ref defaults to HEAD)
#   bash scripts/trigger-deploy.sh --package-only [ref]     # build the artifact, print its path, stop
#
# Environment:
#   GIT_DIR      repository to package from (default: the current one; a bare repo works)
#   SSH_OPTS     extra ssh options, e.g. "-i ~/.ssh/dimension_deploy" (the key is never stored here)
#   OUT_DIR      where --package-only writes the artifact (default: a temp directory)
#   REMOTE_CMD   remote command prefix (default "receive", for the forced-command deploy key;
#                use "bash /opt/dimension/bin/deploy.sh receive" for an unrestricted admin key)
#
# The artifact is `git archive` of exactly one commit, restricted to an ALLOW-LIST
# of runtime paths: anything not declared below is never shipped, whatever is
# tracked or lying in a working tree (.env, data/, graphify-out/, openspec/, ...).
# test/, package.json and .gitignore ship because the host runs the suite in the
# release before activating it, and the guardrail tests read those files.

set -Eeuo pipefail

INCLUDE_PATHS=(server.js package.json package-lock.json .nvmrc .gitignore src public test scripts)
# Belt and braces: none of these may appear in an artifact even if the allow-list changes.
FORBIDDEN_PATTERN='^(\.env($|\.)|\.git/|node_modules/|graphify-out/|openspec/|temp/|download/|\.claude/|\.agents/|\.opencode/|data/)'

log() { printf '[trigger %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

package_only=0
if [[ "${1:-}" == "--package-only" ]]; then package_only=1; shift; fi
target=""
if (( ! package_only )); then
    target="${1:-}"; shift || true
    [[ -n "$target" ]] || die "usage: bash scripts/trigger-deploy.sh <ssh-target> [ref] | --package-only [ref]"
fi
ref="${1:-HEAD}"

commit="$(git rev-parse --verify --quiet "${ref}^{commit}")" || die "not a commit: $ref"
epoch="$(git show -s --format=%ct "$commit")"

out_dir="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/dimension-pkg.XXXXXX")}"
mkdir -p "$out_dir"
artifact="$out_dir/dimension-${commit:0:12}.tar.gz"

present=()
for p in "${INCLUDE_PATHS[@]}"; do
    git cat-file -e "${commit}:${p}" 2>/dev/null && present+=("$p")
done
git archive --format=tar.gz -o "$artifact" "$commit" -- "${present[@]}" \
    || die "git archive failed for $commit"

# Verify the artifact before it leaves this machine.
listing="$(tar -tzf - < "$artifact")"   # stdin: a "C:/..." path would be read as a remote host by GNU tar
if grep -Eq "$FORBIDDEN_PATTERN" <<< "$listing"; then
    die "artifact contains a forbidden path: $(grep -E "$FORBIDDEN_PATTERN" <<< "$listing" | head -n 3 | tr '\n' ' ')"
fi
for p in server.js package-lock.json src/routes/api.js public/index.html; do
    grep -qx "$p" <<< "$listing" || die "artifact is missing $p"
done
log "Packaged ${commit:0:12} ($(grep -cv '/$' <<< "$listing") files, $(du -h "$artifact" | cut -f1)) -> $artifact"

if (( package_only )); then
    echo "$artifact"
    exit 0
fi

# One SSH session: the artifact streams on stdin into the host's forced command.
# With the restricted deploy key, the remote side ignores everything but this
# command line (deploy.sh `ssh` subcommand); without it, run deploy.sh directly.
log "Shipping ${commit:0:12} to $target"
rc=0
# shellcheck disable=SC2086  # SSH_OPTS is deliberately word-split.
ssh ${SSH_OPTS:-} -o BatchMode=yes "$target" "${REMOTE_CMD:-receive} $commit $epoch" < "$artifact" || rc=$?
rm -rf -- "$out_dir"
exit "$rc"
