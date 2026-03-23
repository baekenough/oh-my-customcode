#!/bin/bash
set -euo pipefail

# Eval-Core Batch Save on Session End (Advisory Only)
# Trigger: Stop hook
# Purpose: Auto-collect eval metrics on session end via eval-core CLI
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always
#
# This hook is advisory-only and never blocks session termination.
# If eval-core is unavailable or collection fails, the session continues normally.

input=$(cat)
PPID_FILE="/tmp/.claude-task-outcomes-${PPID}"

# Only attempt collection if outcome file exists
if [ ! -f "$PPID_FILE" ]; then
  echo "$input"
  exit 0
fi

# Discover eval-core CLI using multiple strategies
EVAL_CORE=""

# Strategy 1: Global CLI installation
if command -v eval-core >/dev/null 2>&1; then
  EVAL_CORE="eval-core"
fi

# Strategy 2: Workspace package (oh-my-customcode development)
if [ -z "$EVAL_CORE" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  WORKSPACE_CLI="$PROJECT_ROOT/packages/eval-core/src/cli/index.ts"
  if [ -f "$WORKSPACE_CLI" ] && command -v bun >/dev/null 2>&1; then
    EVAL_CORE="bun run $WORKSPACE_CLI"
  fi
fi

if [ -n "$EVAL_CORE" ]; then
  echo "[Hook] Collecting eval metrics via eval-core..." >&2
  $EVAL_CORE collect --ppid "$PPID" 2>/dev/null || true
fi

# Always pass through input and exit 0 (advisory only)
echo "$input"
exit 0
