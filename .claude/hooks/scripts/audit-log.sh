#!/bin/bash
# Audit Log Hook — Append-only JSONL persistence
# Trigger: PostToolUse on Edit, Write, Bash, Agent
# Purpose: Persistent audit trail for security and compliance
# Protocol: stdin JSON -> log entry -> stdout pass-through
# Always exits 0 (advisory only)

set -euo pipefail
HOOK_START=$(date +%s%N 2>/dev/null || echo 0)

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Extract fields from hook input
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.command // ""' | head -c 200)
agent_type=$(echo "$input" | jq -r '.agent_type // "unknown"')
model=$(echo "$input" | jq -r '.model // "unknown"')
is_error=$(echo "$input" | jq -r '.tool_output.is_error // false')
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Determine outcome
if [ "$is_error" = "true" ]; then
  outcome="error"
else
  outcome="success"
fi

# Audit log location
AUDIT_LOG="${HOME}/.claude/audit.jsonl"

# Ensure directory exists
mkdir -p "$(dirname "$AUDIT_LOG")"

# Write audit entry (append-only JSONL)
jq -cn \
  --arg ts "$timestamp" \
  --arg tool "$tool_name" \
  --arg path "$file_path" \
  --arg agent "$agent_type" \
  --arg model "$model" \
  --arg outcome "$outcome" \
  --arg ppid "${PPID}" \
  '{timestamp: $ts, tool: $tool, path: $path, agent_type: $agent, model: $model, outcome: $outcome, session_ppid: $ppid}' \
  >> "$AUDIT_LOG" 2>/dev/null || true

# Daily rotation check (rotate if > 10MB)
if [ -f "$AUDIT_LOG" ]; then
  file_size=$(stat -f%z "$AUDIT_LOG" 2>/dev/null || stat -c%s "$AUDIT_LOG" 2>/dev/null || echo "0")
  if [ "$file_size" -gt 10485760 ]; then
    mv "$AUDIT_LOG" "${AUDIT_LOG}.$(date -u +%Y%m%d%H%M%S)" 2>/dev/null || true
  fi
fi

# Pass through
echo "$input"
HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
  HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
  echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
fi
exit 0
