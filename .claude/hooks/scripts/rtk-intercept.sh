#!/bin/bash
# RTK Auto-Intercept Hook
# Trigger: PreToolUse (Bash matcher)
# Purpose: Transparently rewrite CLI commands through RTK proxy
# Protocol: stdin JSON → stdout modified JSON, exit 0 always

set -euo pipefail

input=$(cat)

# Only intercept Bash tool calls
tool_name=$(echo "$input" | jq -r '.tool // empty' 2>/dev/null || echo "")
if [ "$tool_name" != "Bash" ]; then
  echo "$input"
  exit 0
fi

# Check RTK availability
RTK_AVAILABLE=false
STATUS_FILE="/tmp/.claude-env-status-${PPID}"
if [ -f "$STATUS_FILE" ] && grep -q "rtk=available" "$STATUS_FILE" 2>/dev/null; then
  RTK_AVAILABLE=true
elif command -v rtk >/dev/null 2>&1; then
  RTK_AVAILABLE=true
fi

if [ "$RTK_AVAILABLE" != "true" ]; then
  echo "$input"
  exit 0
fi

# Extract command
cmd=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
if [ -z "$cmd" ]; then
  echo "$input"
  exit 0
fi

# Skip if already using rtk
if echo "$cmd" | grep -qE '^rtk\b'; then
  echo "$input"
  exit 0
fi

# Skip complex commands (pipes, redirections, background, subshells, semicolons with multiple commands)
if echo "$cmd" | grep -qE '[|><&]|;\s*\w'; then
  echo "$input"
  exit 0
fi

# RTK-supported command prefixes
RTK_CMDS="ls find tree du cat head tail wc grep rg git cargo npm pnpm bun pip pytest vitest jest rspec eslint tsc ruff docker kubectl"

# Extract first word of command (skip env var assignments like FOO=bar)
first_word=$(echo "$cmd" | sed 's/^[A-Z_]*=[^ ]* //' | awk '{print $1}')

# Check if command is RTK-supported
SUPPORTED=false
for rtk_cmd in $RTK_CMDS; do
  if [ "$first_word" = "$rtk_cmd" ]; then
    SUPPORTED=true
    break
  fi
done

if [ "$SUPPORTED" != "true" ]; then
  echo "$input"
  exit 0
fi

# Rewrite command with rtk prefix
new_cmd="rtk $cmd"
echo "[RTK] Intercepted: $cmd → $new_cmd" >&2

# Output modified JSON
echo "$input" | jq --arg new_cmd "$new_cmd" '.tool_input.command = $new_cmd'
exit 0
