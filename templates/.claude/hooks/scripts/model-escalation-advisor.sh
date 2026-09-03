#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Model Escalation Advisor Hook
# Trigger: PreToolUse, tool == "Task" || tool == "Agent"
# Purpose: Advise model escalation when failure patterns detected
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0.
# Hooks must never crash (R021); jq parse errors would otherwise abort under `set -e`. (#1650)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# Extract current task info
agent_type=$(printf '%s\n' "$input" | jq -r '.tool_input.subagent_type? // "unknown"')
current_model=$(printf '%s\n' "$input" | jq -r '.tool_input.model? // "inherit"')

# Session-scoped outcome log
OUTCOME_FILE="/tmp/.claude-task-outcomes-${PPID}"

# Skip if no history
if [ ! -f "$OUTCOME_FILE" ]; then
  printf '%s\n' "$input"
  exit 0
fi

# Thresholds
FAILURE_THRESHOLD=2
CONSECUTIVE_THRESHOLD=3
COOLDOWN=5

# Count failures for this agent type
#
# `grep -c` COUNT HYGIENE (#1656 E): a no-match `grep -c` prints `0` on stdout AND
# exits 1, so the old `$(grep -c ... || echo "0")` appended a SECOND zero and the
# variable became the two-line string "0\n0". Every later `[ "$count" -ge N ]` then
# failed with "integer expression expected" on stderr — noise indistinguishable
# from a real hook fault, on the exact path (zero failures) that is the common case.
# `|| true` keeps grep's own `0` and `${x:-0}` covers an unreadable file.
agent_failures=0
if [ -n "$agent_type" ] && [ "$agent_type" != "unknown" ]; then
  agent_failures=$(grep -c "\"agent_type\":\"${agent_type}\".*\"outcome\":\"failure\"" "$OUTCOME_FILE" 2>/dev/null || true)
  agent_failures=${agent_failures:-0}
fi

# Count consecutive failures (tail entries)
consecutive_failures=$(tail -${CONSECUTIVE_THRESHOLD} "$OUTCOME_FILE" 2>/dev/null | grep -c '"outcome":"failure"' 2>/dev/null || true)
consecutive_failures=${consecutive_failures:-0}

# Escalation path
# NOTE: Agent tool `model` param is an enum of exactly 4 values: sonnet | opus | haiku | fable.
# Full model IDs and virtual/versioned aliases NEVER match here — they never reach this
# script via tool_input.model, so using them as case labels silently no-ops the entire
# advisory (no error, just dead code). Keep case labels as bare enum aliases only.
next_model=""
cost_multiplier=""
case "$current_model" in
  haiku)
    next_model="sonnet"
    cost_multiplier="~3x"
    ;;
  sonnet)
    next_model="opus"
    cost_multiplier="~1.5-2x"
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
  # Same `grep -c` hygiene as above (#1656 E).
  recent_successes=$(tail -${COOLDOWN} "$OUTCOME_FILE" 2>/dev/null | grep -c '"outcome":"success"' 2>/dev/null || true)
  recent_successes=${recent_successes:-0}

  if [ "$recent_successes" -ge "$COOLDOWN" ]; then
    lower_model=""
    # Same enum constraint as the escalation case above: bare aliases only.
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
printf '%s\n' "$input"
exit 0
