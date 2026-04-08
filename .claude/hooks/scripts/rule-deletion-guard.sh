#!/bin/bash
# rule-deletion-guard.sh — Block rule file deletion without individual user confirmation
# Requires: jq

set -uo pipefail

input=$(cat)

# Dependency check — allow if jq missing
if ! command -v jq &>/dev/null; then
  echo "$input"
  exit 0
fi

# Parse tool input
tool=$(echo "$input" | jq -r '.tool // ""' 2>/dev/null) || { echo "$input"; exit 0; }
cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || { echo "$input"; exit 0; }

# Only check Bash tool
if [ "$tool" != "Bash" ]; then
  echo "$input"
  exit 0
fi

# Check if command would delete parent directories containing rules
if echo "$cmd" | grep -qE '(^|\s)(rm|git\s+rm|mv|unlink)\s' && echo "$cmd" | grep -qE '\.claude/?(\s|$)'; then
  echo "[Hook] ⛔ RULE DELETION BLOCKED — Parent directory deletion detected" >&2
  echo "[Hook] This command would delete the entire .claude/ directory including all rules." >&2
  echo "[Hook] Delete rules individually with user confirmation." >&2
  exit 2
fi

# Check if command targets .claude/rules/ for deletion (including mv, unlink)
if echo "$cmd" | grep -qE '(^|\s)(rm|git\s+rm|mv|unlink)\s' && echo "$cmd" | grep -qE '\.claude/rules(/|\s|$)'; then
  # Extract target files
  targets=$(echo "$cmd" | grep -oE '\.claude/rules/[^ ]+' | tr '\n' ', ' | sed 's/,$//')
  target_count=$(echo "$cmd" | grep -oE '\.claude/rules/[^ ]+' | wc -l | tr -d ' ')

  # Check for glob/wildcard patterns or multiple targets
  if echo "$cmd" | grep -qE '\.claude/rules/\*|\.claude/rules/[^ ]*\*' || [ "$target_count" -gt 1 ]; then
    echo "[Hook] ⛔ RULE DELETION BLOCKED — Multiple rules detected" >&2
    echo "[Hook] Targets: $targets" >&2
    echo "[Hook] Rule files must be deleted ONE AT A TIME with user confirmation." >&2
    echo "[Hook] Delete each rule individually after asking: \"정말 {파일명}을(를) 삭제하시겠습니까?\"" >&2
    exit 2
  fi

  # Single rule file
  filename=$(basename "$targets" 2>/dev/null || echo "$targets")
  echo "[Hook] ⛔ RULE DELETION BLOCKED" >&2
  echo "[Hook] Target: $filename" >&2
  echo "[Hook] Rule files require individual user confirmation before deletion." >&2
  echo "[Hook] Ask the user: \"정말 ${filename}을(를) 삭제하시겠습니까?\"" >&2
  echo "[Hook] Only proceed after explicit user approval." >&2
  exit 2
fi

# Not a rule deletion — pass through
echo "$input"
exit 0
