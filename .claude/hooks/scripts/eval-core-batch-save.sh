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

# Only attempt collection if outcome file exists and eval-core is available
if [ -f "$PPID_FILE" ] && command -v eval-core >/dev/null 2>&1; then
  echo "[Hook] Collecting eval metrics via eval-core..." >&2
  eval-core collect --ppid "$PPID" 2>/dev/null || true
fi

# Always pass through input and exit 0 (advisory only)
echo "$input"
exit 0
