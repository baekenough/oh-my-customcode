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

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0.
# Hooks must never crash (R021); jq parse errors would otherwise abort under `set -e`. (#1650)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# Extract fields from hook input
tool_name=$(printf '%s\n' "$input" | jq -r '.tool_name // "unknown"')
file_path=$(printf '%s\n' "$input" | jq -r '.tool_input.file_path? // .tool_input.command? // ""' | head -c 200)
# Agent identity and model. PostToolUse has NO top-level `model` at all, and its
# top-level `agent_type` is present only when the hook fires from inside a subagent
# (CC 2.1.259 schema: "Present when the hook fires from within a subagent") — so on
# the main thread both reads resolved to "unknown" on every single entry.
# Measured replacements (#1656 C): the Agent tool's result object carries
# `resolvedModel` (892 occurrences in this project's transcript corpus, e.g.
# "claude-sonnet-5" / "claude-opus-5[1m]") and, on the synchronous shape, `agentType`;
# the spawn arguments carry `subagent_type`.
# `?` keeps a scalar-shaped tool_input/tool_response from aborting under `set -euo pipefail`.
agent_type=$(printf '%s\n' "$input" | jq -r '
  (.agent_type?
    // .tool_input?.subagent_type?
    // .tool_response?.agentType?
    // "unknown") | tostring
' 2>/dev/null) || agent_type="unknown"
model=$(printf '%s\n' "$input" | jq -r '
  (.model?
    // .tool_response?.resolvedModel?
    // "unknown") | tostring
' 2>/dev/null) || model="unknown"
# Outcome signal. PostToolUse carries the result under `tool_response`, not
# `tool_output` (measured 2026-09-03: 1764/1764 PostToolUse payloads had
# `tool_response`, 0/1764 had `tool_output`), so the old `.tool_output.is_error`
# read was always absent and every entry was logged as outcome=success.
# Failure signals read below: `.tool_response.is_error` (generic) and
# `.tool_response.interrupted`. The latter is present on every Bash response but
# was never observed true in this corpus (0/1555), so it is defensive coverage —
# not a signal measured to fire.
# jq's `//` treats both null and false as absent, so this chain is an OR:
# the result is true iff at least one signal is true.
is_error=$(printf '%s\n' "$input" | jq -r '
  (.tool_response?.is_error?
    // .tool_response?.interrupted?
    // .tool_output?.is_error?
    // false) | tostring
' 2>/dev/null) || is_error="false"
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
printf '%s\n' "$input"
HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
  HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
  echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
fi
exit 0
