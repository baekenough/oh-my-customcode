#!/bin/bash
set -euo pipefail

# Consecutive-Completion Guard (file name kept for hook wiring)
# Trigger: SubagentStop
# Purpose: Count consecutive subagent completions and emit an advisory from the 4th consecutive completion on
# Protocol: stdin JSON -> count check -> stdout pass-through, the only explicit exit is exit 0 (R021); under set -u a corrupt counter file can exit 1 (non-blocking for SubagentStop)

input=$(cat)

count_file="/tmp/.claude-loop-count-${PPID}"

# Reset counter if >60s idle since the LAST update (window chains per completion)
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

# Advisory from the 4th consecutive completion (each within 60s of the previous)
if [ "$count" -ge 4 ]; then
  echo '[ConsecutiveCompletions] ADVISORY: 4+ consecutive subagent completions, each within 60s of the previous (advisory only; nothing is paused).' >&2
fi

printf '%s\n' "$input"
exit 0
