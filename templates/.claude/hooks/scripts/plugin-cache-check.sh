#!/bin/bash
# plugin-cache-check.sh — SessionStart advisory hook
# Detects shared plugin caches with package.json but missing node_modules.
# Always exit 0 (non-blocking). Output advisory to stderr only.
# Issue: #1207 — plugin cache missing node_modules (e.g. zod/v3 module error)

set -euo pipefail

# Read and pass stdin through unchanged
input=$(cat)

PLUGIN_CACHE="${HOME}/.claude/shared-plugins/cache"

if [ ! -d "$PLUGIN_CACHE" ]; then
  echo "$input"
  exit 0
fi

missing=()
while IFS= read -r pkg; do
  dir=$(dirname "$pkg")
  if [ ! -d "$dir/node_modules" ]; then
    missing+=("$dir")
  fi
done < <(find "$PLUGIN_CACHE" -maxdepth 4 -name package.json 2>/dev/null)

if [ ${#missing[@]} -gt 0 ]; then
  echo "[Advisory] Plugin cache missing node_modules (run \`(cd <dir> && bun install)\` per directory):" >&2
  for d in "${missing[@]}"; do
    echo "  - $d" >&2
  done
fi

echo "$input"
exit 0
