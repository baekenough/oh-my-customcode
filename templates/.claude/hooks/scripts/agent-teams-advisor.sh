#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Agent Teams Advisor Hook
# Trigger: PreToolUse, tool == "Task" || tool == "Agent"
# Purpose: Track Agent/Task tool usage count per session and warn when Agent Teams may be more appropriate
# Protocol: stdin JSON -> process -> exit 0 always (advisory only)
# Once per session (#1885): each distinct advisory key is shown at most once, claimed atomically via a
# per-key marker dir under /tmp/.claude-teams-advisory-shown-${PPID}.d/ (parallel-hook safe).
# Channel (#1885): exit-0 stderr never reaches the model (CC 2.1.310 probe, #1775 comment 6405197553);
#   the advisory is delivered as stdout JSON hookSpecificOutput.additionalContext. No stdin passthrough.

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0.
# Hooks must never crash (R021); jq parse errors would otherwise abort under `set -e`. (#1650)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# Skip unless Agent Teams is CONFIRMED active.
# session-env-check.sh writes one of: disabled | env-set | enabled (#1588).
#   `env-set` = the env var is set but TeamCreate presence is UNVERIFIED — R018 is dormant,
#              so recommending TeamCreate here would be unactionable advice.
# The `!= "enabled"` test below therefore deliberately skips on `env-set`; only the measured
# OMCUSTOM_AGENT_TEAMS_VERIFIED=1 path re-enables this advisor.
ENV_STATUS="/tmp/.claude-env-status-${PPID}"
if [ -f "$ENV_STATUS" ]; then
  teams_status=$(grep "agent_teams=" "$ENV_STATUS" 2>/dev/null | cut -d= -f2 || echo "unknown")
  if [ "$teams_status" != "enabled" ]; then
    exit 0
  fi
fi

# Batch context detection: check for workflow or release-plan state
BATCH_ISSUES=0
# Use wildcard to match any workflow name: /tmp/.claude-workflow-*-${PPID}.json
WORKFLOW_FILE=$(ls /tmp/.claude-workflow-*-"${PPID}".json 2>/dev/null | head -1 || true)
if [ -n "$WORKFLOW_FILE" ] && [ -f "$WORKFLOW_FILE" ]; then
  BATCH_ISSUES=$(jq -r '.issue_count // 0' "$WORKFLOW_FILE" 2>/dev/null || echo 0)
  # Sanitize before arithmetic: non-numeric/over-long -> 0; 10# avoids base-8 errors on leading zeros.
  case "$BATCH_ISSUES" in ''|*[!0-9]*|??????????*) BATCH_ISSUES=0 ;; esac
  BATCH_ISSUES=$((10#$BATCH_ISSUES))
fi

# Also check release-plan context (existence only — if file exists, treat as batch)
RELEASE_PLAN="/tmp/.claude-release-plan-${PPID}"
if [ -f "$RELEASE_PLAN" ]; then
  if [ "$BATCH_ISSUES" -lt 3 ]; then
    BATCH_ISSUES=3
  fi
fi

# Extract task info from input
agent_type=$(printf '%s\n' "$input" | jq -r '.tool_input.subagent_type? // "unknown"')
prompt_preview=$(printf '%s\n' "$input" | jq -r '(.tool_input.description? // "") | tostring | .[0:60]')

# Session-scoped counter using parent PID as session identifier
COUNTER_FILE="/tmp/.claude-task-count-${PPID}"

# Read and increment counter
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
  case "$COUNT" in ''|*[!0-9]*|??????????*) COUNT=0 ;; esac
  COUNT=$((10#$COUNT))
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
{ echo "$COUNT" > "$COUNTER_FILE"; } 2>/dev/null || true

SHOWN_DIR="/tmp/.claude-teams-advisory-shown-${PPID}.d"
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

# Warn when batch context detected (even on first call) or from 2nd call onward
ctx=""
if [ "$BATCH_ISSUES" -ge 3 ] && [ "$COUNT" -eq 1 ] && fresh "batch:${BATCH_ISSUES}"; then
  ctx="
--- [R018 Advisor] Batch context detected (${BATCH_ISSUES} issues) ---
  RECOMMENDATION: Use Agent Teams (TeamCreate) for this batch.
  Current: Agent(${agent_type}) -- ${prompt_preview}
-----------------------------------------------------------"
elif [ "$COUNT" -ge 2 ] && fresh "repeat"; then
  ctx="
--- [R018 Advisor] Agent/Task tool call #${COUNT} in this session ---
  WARNING: Multiple Task calls detected. Consider Agent Teams if:
    * 3+ agents needed for this work
    * Review -> fix -> re-review cycle exists
    * Agents need shared state or coordination
  Current: Agent(${agent_type}) -- ${prompt_preview}
-----------------------------------------------------------"
fi

# Advisory only, never blocks: emit additionalContext when there is something to say
if [ -n "$ctx" ]; then
  jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
fi
exit 0
