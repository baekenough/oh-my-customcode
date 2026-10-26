#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Model Escalation Advisor Hook
# Trigger: PreToolUse, tool == "Task" || tool == "Agent"
# Purpose: Advise model escalation when failure patterns detected
# Protocol: stdin JSON -> process -> exit 0 always
# Once per session (#1885): each distinct advisory key is shown at most once, claimed atomically via a
# per-key marker dir under /tmp/.claude-model-advisory-shown-${PPID}.d/ (parallel-hook safe).
# De-escalation is opt-in (OMCUSTOM_MODEL_DEESCALATION=on): task-outcome-recorder.sh records every
# SubagentStop as outcome=success (no error signal), so "N consecutive successes" only means N agents finished (#1885).
# Channel (#1885): exit-0 stderr never reaches the model; advice is delivered via stdout JSON
# hookSpecificOutput.additionalContext (measured CC 2.1.310, #1775). No stdin passthrough, no stderr.

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
  exit 0
fi

ctx=""
SHOWN_DIR="/tmp/.claude-model-advisory-shown-${PPID}.d"
# fresh KEY: atomic claim via mkdir of a per-key marker dir (hash of KEY; no shared file, so no
# check-then-append race and no newline pollution). Success => emit. State failures are silent;
# if the marker dir itself is unusable we fail open (emit) rather than lose the advisory.
fresh() {
  { mkdir -p "$SHOWN_DIR"; } 2>/dev/null || true
  [ -d "$SHOWN_DIR" ] || return 0
  local h
  h=$(printf '%s' "$1" | cksum | cut -d' ' -f1) || h=""
  [ -n "$h" ] || return 0
  if { mkdir "$SHOWN_DIR/$h"; } 2>/dev/null; then return 0; fi
  return 1
}
add() { if [ -z "$ctx" ]; then ctx="$1"; else ctx="${ctx}"$'\n'"$1"; fi; }

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

  if [ "$should_advise" = true ] && fresh "esc:${agent_type}:${current_model}->${next_model}"; then
    add ""
    add "--- [Model Escalation Advisory] ---"
    add "  Agent type: ${agent_type}"
    add "  Current model: ${current_model}"
    add "  ⚡ Recommended: Escalate to ${next_model}"
    add "  Cost impact: ${cost_multiplier} per task"
    add "  Reason: ${reason}"
    add "------------------------------------"
  fi
fi

# De-escalation check
if [ "${OMCUSTOM_MODEL_DEESCALATION:-}" = "on" ] && [ "$current_model" != "haiku" ] && [ "$current_model" != "inherit" ] && [ "$current_model" != "" ]; then
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

    if [ -n "$lower_model" ] && fresh "deesc:${current_model}->${lower_model}"; then
      add ""
      add "--- [Model De-escalation Advisory] ---"
      add "  ↓ Consider: ${current_model} → ${lower_model}"
      add "  ${recent_successes} consecutive successes"
      add "--------------------------------------"
    fi
  fi
fi

# Emit advisory to the model (#1885); silent when nothing to advise.
if [ -n "$ctx" ]; then
  jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
fi
exit 0
