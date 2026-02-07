#!/usr/bin/env bash
# verify-sync.sh - Verify templates are in sync with source (read-only)
# Usage: ./scripts/verify-sync.sh /path/to/source

set -euo pipefail

SOURCE="${1:?Usage: $0 /path/to/source}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES="$SCRIPT_DIR/../templates"

DRIFT=0
TOTAL=0

check_sync() {
  local src="$1" dst="$2" label="$3"

  if [[ ! -e "$src" ]]; then
    echo "[skip] $label (source not found)"
    return
  fi

  TOTAL=$((TOTAL + 1))

  if [[ -d "$src" ]]; then
    # Use rsync dry-run to detect differences
    local changes
    changes=$(rsync -an --delete "$src/" "$dst/" 2>/dev/null | grep -v '/$' | head -20) || true
    if [[ -n "$changes" ]]; then
      echo "[DRIFT] $label"
      echo "$changes" | sed 's/^/  /'
      DRIFT=$((DRIFT + 1))
    else
      echo "[OK] $label"
    fi
  else
    if [[ -f "$dst" ]] && diff -q "$src" "$dst" >/dev/null 2>&1; then
      echo "[OK] $label"
    else
      echo "[DRIFT] $label"
      DRIFT=$((DRIFT + 1))
    fi
  fi
}

echo "=== Template Sync Verification ==="
echo "Source: $SOURCE"
echo "Templates: $TEMPLATES"
echo ""

check_sync "$SOURCE/.claude/agents/" "$TEMPLATES/.claude/agents/" "agents"
check_sync "$SOURCE/.claude/skills/" "$TEMPLATES/.claude/skills/" "skills"
check_sync "$SOURCE/.claude/rules/" "$TEMPLATES/.claude/rules/" "rules"
check_sync "$SOURCE/.claude/hooks/" "$TEMPLATES/.claude/hooks/" "hooks"
check_sync "$SOURCE/.claude/contexts/" "$TEMPLATES/.claude/contexts/" "contexts"
check_sync "$SOURCE/guides/" "$TEMPLATES/guides/" "guides"

echo ""
echo "=== Summary ==="
echo "Checked: $TOTAL components"
echo "In sync: $((TOTAL - DRIFT))"
echo "Drifted: $DRIFT"

if [[ $DRIFT -gt 0 ]]; then
  echo ""
  echo "Run 'bun run scripts/sync-core.ts /path/to/source' to sync."
  exit 1
fi

echo "All templates in sync!"
exit 0
