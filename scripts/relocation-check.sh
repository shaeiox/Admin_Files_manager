#!/usr/bin/env bash
# scripts/relocation-check.sh - run the whole suite from a copy of this repository
# placed at a fresh path with a space in its name, read-only (isolate-app-roots D8).
#
#   bash scripts/relocation-check.sh
#
# Proves the code needs nothing from where it was developed: no .env, no data/,
# no sibling repository, no write access to itself. test/integration/relocation.test.js
# (part of `npm test`, so also of every deploy) covers the production smoke start
# and the path lint; this script adds the full suite in the relocated copy.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base="$(mktemp -d)"
copy="$base/relocated app"
trap 'chmod -R u+w "$base" 2>/dev/null || true; rm -rf "$base"' EXIT

mkdir -p "$copy"
tar -C "$repo" \
    --exclude=./.git --exclude=./node_modules --exclude=./data --exclude=./temp \
    --exclude=./graphify-out --exclude=./docs-vault --exclude='./~' --exclude=./.env \
    --exclude=./portal.log -cf - . | tar -C "$copy" -xf -
ln -s "$repo/node_modules" "$copy/node_modules"
chmod -R a-w "$copy"

echo "[relocation] running npm test in: $copy"
# The suites write only to os.tmpdir(); a write into the copy fails (unless run as root).
( cd "$copy" && env -u STORAGE_ROOT -u AFM_DATA_DIR -u NODE_ENV -u PORT npm test )
echo "[relocation] OK"
