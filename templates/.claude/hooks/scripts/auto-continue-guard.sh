#!/bin/bash
set -euo pipefail

# Auto-Continue Guard
# Trigger: SubagentStop
# Purpose: Count consecutive subagent completions and warn when auto-continue limit reached
# Protocol: stdin JSON -> count check -> stdout pass-through, exit 0 always (R021)

input=$(cat)

count_file="/tmp/.claude-loop-count-${PPID}"

# Reset counter if stale (>60s since last update)
if [ -f "$count_file" ]; then
  last_mod=$(stat -c%Y "$count_file" 2>/dev/null || stat -f%m "$count_file" 2>/dev/null || echo 0)
  now=$(date +%s)
  if [ $((now - last_mod)) -gt 60 ]; then
    echo 0 > "$count_file"
  fi
fi

# Increment counter
count=$(cat "$count_file" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$count_file"

# Warn if limit reached
if [ "$count" -ge 4 ]; then
  echo '[AutoContinue] SAFETY: auto-continue limit (3) reached. Pausing.' >&2
fi

echo "$input"
exit 0
