#!/bin/bash
# Schema Validator Hook — PreToolUse input validation
# Trigger: PreToolUse on Write, Edit, Bash
# Purpose: Validate tool inputs against JSON Schema definitions
# Phase 1: Advisory only (exit 0 with stderr warning)
# Protocol: stdin JSON -> validate -> stdout pass-through

set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Extract tool info
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
tool_input=$(echo "$input" | jq -r '.tool_input // {}')

SCHEMA_FILE=".claude/schemas/tool-inputs.json"

# Skip if schema file doesn't exist
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "$input"
  exit 0
fi

warnings=()

case "$tool_name" in
  "Write")
    file_path=$(echo "$tool_input" | jq -r '.file_path // ""')
    content=$(echo "$tool_input" | jq -r '.content // ""')

    if [ -z "$file_path" ]; then
      warnings+=("[Schema] Write: file_path is empty or missing")
    fi
    if [ -z "$content" ]; then
      warnings+=("[Schema] Write: content is empty — creating empty file?")
    fi
    ;;

  "Edit")
    file_path=$(echo "$tool_input" | jq -r '.file_path // ""')
    old_string=$(echo "$tool_input" | jq -r '.old_string // ""')
    new_string=$(echo "$tool_input" | jq -r '.new_string // ""')

    if [ -z "$file_path" ]; then
      warnings+=("[Schema] Edit: file_path is empty or missing")
    fi
    if [ -z "$old_string" ]; then
      warnings+=("[Schema] Edit: old_string is empty")
    fi
    if [ "$old_string" = "$new_string" ]; then
      warnings+=("[Schema] Edit: old_string equals new_string — no-op edit")
    fi
    ;;

  "Bash")
    command=$(echo "$tool_input" | jq -r '.command // ""')

    if [ -z "$command" ]; then
      warnings+=("[Schema] Bash: command is empty")
    fi

    # Check dangerous patterns
    if echo "$command" | grep -qE 'rm\s+-rf\s+/[^.]'; then
      warnings+=("[Schema] Bash: DANGER — recursive delete from root detected")
    fi
    if echo "$command" | grep -qE '^\s*sudo\s+'; then
      warnings+=("[Schema] Bash: elevated privilege command detected")
    fi
    if echo "$command" | grep -qE '> /dev/sd'; then
      warnings+=("[Schema] Bash: direct disk write detected")
    fi
    if echo "$command" | grep -qE 'mkfs\.'; then
      warnings+=("[Schema] Bash: filesystem format command detected")
    fi
    # Remote code execution via pipe
    if echo "$command" | grep -qE 'curl\s+.*\|\s*(ba)?sh'; then
      warnings+=("[Schema] Bash: remote code execution pattern (curl | bash) detected")
    fi
    if echo "$command" | grep -qE 'wget\s+.*\|\s*(ba)?sh'; then
      warnings+=("[Schema] Bash: remote code execution pattern (wget | sh) detected")
    fi
    # Dynamic code execution
    if echo "$command" | grep -qE 'eval\s+\$\('; then
      warnings+=("[Schema] Bash: dynamic code execution (eval) detected")
    fi
    # Broad permission grant
    if echo "$command" | grep -qE 'chmod\s+777'; then
      warnings+=("[Schema] Bash: broad permission grant (chmod 777) detected")
    fi
    ;;
esac

# Output warnings (advisory only)
if [ ${#warnings[@]} -gt 0 ]; then
  for w in "${warnings[@]}"; do
    echo "$w" >&2
  done
  echo "[Schema] Phase 1: advisory only — not blocking" >&2
fi

# Always pass through (Phase 1)
echo "$input"
exit 0
