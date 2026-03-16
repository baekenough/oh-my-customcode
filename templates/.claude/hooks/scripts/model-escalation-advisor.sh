#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Model Escalation Advisor Hook
# Trigger: PreToolUse, tool == "Task" || tool == "Agent"
# Purpose: Advise model escalation when failure patterns detected
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always

input=$(cat)

# Extract current task info
agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // "unknown"')
current_model=$(echo "$input" | jq -r '.tool_input.model // "inherit"')

# Session-scoped outcome log
OUTCOME_FILE="/tmp/.claude-task-outcomes-${PPID}"

# Skip if no history
if [ ! -f "$OUTCOME_FILE" ]; then
  echo "$input"
  exit 0
fi

# Thresholds
FAILURE_THRESHOLD=2
CONSECUTIVE_THRESHOLD=3
COOLDOWN=5

# Count failures for this agent type
agent_failures=0
if [ -n "$agent_type" ] && [ "$agent_type" != "unknown" ]; then
  agent_failures=$(grep -c "\"agent_type\":\"${agent_type}\".*\"outcome\":\"failure\"" "$OUTCOME_FILE" 2>/dev/null || echo "0")
fi

# Count consecutive failures (tail entries)
consecutive_failures=$(tail -${CONSECUTIVE_THRESHOLD} "$OUTCOME_FILE" 2>/dev/null | grep -c '"outcome":"failure"' 2>/dev/null || echo "0")

# Escalation path
next_model=""
cost_multiplier=""
case "$current_model" in
  haiku)
    next_model="sonnet"
    cost_multiplier="~3-5x"
    ;;
  sonnet)
    next_model="opus"
    cost_multiplier="~5-10x"
    ;;
  *)
    next_model=""
    ;;
esac

# Advise escalation
if [ -n "$next_model" ]; then
  should_advise=false
  reason=""

  if [ "$agent_failures" -ge "$FAILURE_THRESHOLD" ]; then
    should_advise=true
    reason="${agent_type} failed ${agent_failures}x with ${current_model}"
  elif [ "$consecutive_failures" -ge "$CONSECUTIVE_THRESHOLD" ]; then
    should_advise=true
    reason="${consecutive_failures} consecutive failures"
  fi

  if [ "$should_advise" = true ]; then
    echo "" >&2
    echo "--- [Model Escalation Advisory] ---" >&2
    echo "  Agent type: ${agent_type}" >&2
    echo "  Current model: ${current_model}" >&2
    echo "  ⚡ Recommended: Escalate to ${next_model}" >&2
    echo "  Cost impact: ${cost_multiplier} per task" >&2
    echo "  Reason: ${reason}" >&2
    echo "------------------------------------" >&2
  fi
fi

# De-escalation check
if [ "$current_model" != "haiku" ] && [ "$current_model" != "inherit" ] && [ "$current_model" != "" ]; then
  recent_successes=$(tail -${COOLDOWN} "$OUTCOME_FILE" 2>/dev/null | grep -c '"outcome":"success"' 2>/dev/null || echo "0")

  if [ "$recent_successes" -ge "$COOLDOWN" ]; then
    lower_model=""
    case "$current_model" in
      opus) lower_model="sonnet" ;;
      sonnet) lower_model="haiku" ;;
    esac

    if [ -n "$lower_model" ]; then
      echo "" >&2
      echo "--- [Model De-escalation Advisory] ---" >&2
      echo "  ↓ Consider: ${current_model} → ${lower_model}" >&2
      echo "  ${recent_successes} consecutive successes" >&2
      echo "--------------------------------------" >&2
    fi
  fi
fi

# Pass through
echo "$input"
exit 0
