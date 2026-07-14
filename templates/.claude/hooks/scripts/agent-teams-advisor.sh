#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Agent Teams Advisor Hook
# Trigger: PreToolUse, tool == "Task" || tool == "Agent"
# Purpose: Track Agent/Task tool usage count per session and warn when Agent Teams may be more appropriate
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always (advisory only)

input=$(cat)

# Skip if Agent Teams is not available
ENV_STATUS="/tmp/.claude-env-status-${PPID}"
if [ -f "$ENV_STATUS" ]; then
  teams_status=$(grep "agent_teams=" "$ENV_STATUS" 2>/dev/null | cut -d= -f2 || echo "unknown")
  if [ "$teams_status" != "enabled" ]; then
    echo "$input"
    exit 0
  fi
fi

# Batch context detection: check for workflow or release-plan state
BATCH_ISSUES=0
# Use wildcard to match any workflow name: /tmp/.claude-workflow-*-${PPID}.json
WORKFLOW_FILE=$(ls /tmp/.claude-workflow-*-"${PPID}".json 2>/dev/null | head -1 || true)
if [ -n "$WORKFLOW_FILE" ] && [ -f "$WORKFLOW_FILE" ]; then
  BATCH_ISSUES=$(jq -r '.issue_count // 0' "$WORKFLOW_FILE" 2>/dev/null || echo 0)
fi

# Also check release-plan context (existence only — if file exists, treat as batch)
RELEASE_PLAN="/tmp/.claude-release-plan-${PPID}"
if [ -f "$RELEASE_PLAN" ]; then
  if [ "$BATCH_ISSUES" -lt 3 ]; then
    BATCH_ISSUES=3
  fi
fi

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

# Warn when batch context detected (even on first call) or from 2nd call onward
if [ "$BATCH_ISSUES" -ge 3 ] && [ "$COUNT" -eq 1 ]; then
  echo "" >&2
  echo "--- [R018 Advisor] Batch context detected (${BATCH_ISSUES} issues) ---" >&2
  echo "  RECOMMENDATION: Use Agent Teams (TeamCreate) for this batch." >&2
  echo "  Current: Agent(${agent_type}) -- ${prompt_preview}" >&2
  echo "-----------------------------------------------------------" >&2
elif [ "$COUNT" -ge 2 ]; then
  echo "" >&2
  echo "--- [R018 Advisor] Agent/Task tool call #${COUNT} in this session ---" >&2
  echo "  WARNING: Multiple Task calls detected. Consider Agent Teams if:" >&2
  echo "    * 3+ agents needed for this work" >&2
  echo "    * Review -> fix -> re-review cycle exists" >&2
  echo "    * Agents need shared state or coordination" >&2
  echo "  Current: Agent(${agent_type}) -- ${prompt_preview}" >&2
  echo "-----------------------------------------------------------" >&2
fi

# Always pass through -- advisory only, never blocks
echo "$input"
exit 0
