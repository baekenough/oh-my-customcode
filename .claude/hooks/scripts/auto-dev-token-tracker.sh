#!/usr/bin/env bash
set -euo pipefail

# auto-dev Token Spend Tracker (Issue #1057, Option 1)
# Trigger: PostToolUse on Agent/Task during auto-dev pipeline
# Purpose: Estimate token spend per phase from byte counts (÷4 heuristic)
# Protocol: stdin JSON -> log -> stdout pass-through, exit 0 always
# Gate: only logs when /tmp/.claude-pipeline-auto-dev-${PPID}.json exists

# Always pass through input no matter what
input=$(cat)
trap 'echo "$input"' EXIT

# Gate: only active during auto-dev pipeline
PIPELINE_STATE="/tmp/.claude-pipeline-auto-dev-${PPID}.json"
[ -f "$PIPELINE_STATE" ] || exit 0

# Dependency check
command -v jq >/dev/null 2>&1 || exit 0

LOG_FILE="/tmp/auto-dev-spend-${PPID}.json"

# Extract fields (PostToolUse Agent shape)
agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // "unknown"' 2>/dev/null || echo "unknown")
description=$(echo "$input" | jq -r '.tool_input.description // ""' 2>/dev/null || echo "")
prompt_text=$(echo "$input" | jq -r '.tool_input.prompt // ""' 2>/dev/null || echo "")
output_text=$(echo "$input" | jq -r '.tool_output.output // .tool_output // ""' 2>/dev/null || echo "")

# Derive phase from pipeline state (current_phase) or fallback to description prefix
phase=$(jq -r '.current_phase // .phase // "unknown"' "$PIPELINE_STATE" 2>/dev/null || echo "unknown")
if [ "$phase" = "unknown" ] || [ "$phase" = "null" ]; then
  # Fallback: extract [N] prefix or first word from description
  phase=$(echo "$description" | grep -oE '^\[[0-9]+\][^|]*' | head -c 40 || true)
  [ -z "$phase" ] && phase=$(echo "$description" | head -c 30)
  [ -z "$phase" ] && phase="unknown"
fi

# Byte counts -> token estimate (÷4 heuristic)
in_bytes=$(printf '%s' "$prompt_text" | wc -c | tr -d ' ')
out_bytes=$(printf '%s' "$output_text" | wc -c | tr -d ' ')
tokens_in=$((in_bytes / 4))
tokens_out=$((out_bytes / 4))

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Append JSONL entry
entry=$(jq -n -c \
  --arg ts "$ts" \
  --arg phase "$phase" \
  --arg agent "$agent_type" \
  --argjson tin "$tokens_in" \
  --argjson tout "$tokens_out" \
  '{ts: $ts, phase: $phase, agent: $agent, tokens_in: $tin, tokens_out: $tout}' 2>/dev/null) || exit 0

echo "$entry" >> "$LOG_FILE" 2>/dev/null || true

exit 0
