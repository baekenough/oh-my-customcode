#!/bin/bash
set -euo pipefail

# Agent Teams Advisor Hook
# Trigger: PreToolUse, tool == "Task"
# Purpose: Track Task tool usage count per session and warn when Agent Teams may be more appropriate
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always (advisory only)

input=$(cat)

# Extract task info from input
agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // "unknown"')
prompt_preview=$(echo "$input" | jq -r '.tool_input.description // ""' | head -c 60)

# Session-scoped counter using parent PID as session identifier
COUNTER_FILE="/tmp/.claude-task-count-${PPID}"

# Read and increment counter
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
echo "$COUNT" > "$COUNTER_FILE"

# Warn from 2nd Task call onward -- Agent Teams may be more appropriate
if [ "$COUNT" -ge 2 ]; then
  echo "" >&2
  echo "--- [R018 Advisor] Task tool call #${COUNT} in this session ---" >&2
  echo "  WARNING: Multiple Task calls detected. Consider Agent Teams if:" >&2
  echo "    * 3+ agents needed for this work" >&2
  echo "    * Review -> fix -> re-review cycle exists" >&2
  echo "    * Agents need shared state or coordination" >&2
  echo "  Current: Task(${agent_type}) -- ${prompt_preview}" >&2
  echo "-----------------------------------------------------------" >&2
fi

# Always pass through -- advisory only, never blocks
echo "$input"
exit 0
