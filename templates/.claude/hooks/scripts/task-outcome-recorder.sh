#!/bin/bash
set -euo pipefail

# Task/Agent Outcome Recorder Hook
# Trigger: PostToolUse, tool == "Task" || tool == "Agent"
# Purpose: Record task outcomes for model escalation decisions
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always

input=$(cat)

# Extract task info
agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // "unknown"')
model=$(echo "$input" | jq -r '.tool_input.model // "inherit"')
description=$(echo "$input" | jq -r '.tool_input.description // ""' | head -c 80)

# Determine outcome
is_error=$(echo "$input" | jq -r '.tool_output.is_error // false')

if [ "$is_error" = "true" ]; then
  outcome="failure"
  error_summary=$(echo "$input" | jq -r '.tool_output.output // ""' | head -c 200)
else
  outcome="success"
  error_summary=""
fi

# Session-scoped outcome log
OUTCOME_FILE="/tmp/.claude-task-outcomes-${PPID}"

# Append JSON line entry
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(jq -n \
  --arg ts "$timestamp" \
  --arg agent "$agent_type" \
  --arg model "$model" \
  --arg outcome "$outcome" \
  --arg desc "$description" \
  --arg err "$error_summary" \
  '{timestamp: $ts, agent_type: $agent, model: $model, outcome: $outcome, description: $desc, error_summary: $err}')

echo "$entry" >> "$OUTCOME_FILE"

# Ring buffer: keep last 50 entries
if [ -f "$OUTCOME_FILE" ]; then
  line_count=$(wc -l < "$OUTCOME_FILE")
  if [ "$line_count" -gt 50 ]; then
    tail -50 "$OUTCOME_FILE" > "${OUTCOME_FILE}.tmp"
    mv "${OUTCOME_FILE}.tmp" "$OUTCOME_FILE"
  fi
fi

# Report failures to stderr
if [ "$outcome" = "failure" ]; then
  echo "" >&2
  echo "--- [Agent Outcome] FAILURE: ${agent_type}:${model} ---" >&2
  echo "  ${description}" >&2
  echo "  Error: $(echo "$error_summary" | head -c 100)" >&2
  echo "-----------------------------------------------" >&2
fi

# Pass through
echo "$input"
exit 0
