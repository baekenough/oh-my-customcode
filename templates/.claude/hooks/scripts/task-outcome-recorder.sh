#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Task/Agent Outcome Recorder Hook
# Trigger: PostToolUse (tool == "Task" || "Agent") and SubagentStop
# Purpose: Record task outcomes for model escalation decisions
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always

input=$(cat)

# Extract task info — support both PostToolUse (tool_input.*) and SubagentStop (top-level) shapes
agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // .agent_type // "unknown"')
model=$(echo "$input" | jq -r '.tool_input.model // .model // "inherit"')
description=$(echo "$input" | jq -r '.tool_input.description // .description // ""' | head -c 80)

# Extract skill name from description or prompt
skill_name=""
if echo "$description" | grep -qiE '(skill:|routing|→.*skill)'; then
  skill_name=$(echo "$description" | grep -oiE '[a-z]+-[a-z]+(-[a-z]+)*-?(routing|skill|practices|detection|decomposition|orchestration|pipeline|guards|cycle|plan|review|refactor|publish|version|audit|exec|analyze|bundle|report|setup|watch|lists|status|help|save|recall)' | head -1)
fi
# Fallback: check prompt field for "Skill: {name}" pattern
if [ -z "$skill_name" ]; then
  prompt=$(echo "$input" | jq -r '.tool_input.prompt // ""' | head -c 500)
  skill_name=$(echo "$prompt" | grep -oiE 'Skill:\s*[a-z]+-[a-z]+(-[a-z]+)*' | sed 's/[Ss]kill:\s*//' | head -1)
fi

# Determine outcome
is_error=$(echo "$input" | jq -r '.tool_output.is_error // false')

if [ "$is_error" = "true" ]; then
  outcome="failure"
  error_summary=$(echo "$input" | jq -r '.tool_output.output // ""' | head -c 200)
else
  outcome="success"
  error_summary=""
fi

# Session-scoped outcome log and agent count tracker
OUTCOME_FILE="/tmp/.claude-task-outcomes-${PPID}"
TASK_COUNT_FILE="/tmp/.claude-task-count-${PPID}"

# --- Pattern Detection ---
# Priority: skill-specific patterns > parallel > sequential (default)
pattern="sequential"

# Check description for skill-specific workflow patterns
desc_lower=$(echo "$description" | tr '[:upper:]' '[:lower:]')

if echo "$desc_lower" | grep -qE '(evaluator.optimizer|evaluator_optimizer)'; then
  pattern="evaluator-optimizer"
elif echo "$desc_lower" | grep -qE '(worker.reviewer|worker_reviewer)'; then
  pattern="worker-reviewer"
elif echo "$desc_lower" | grep -qE '(dag.orchestrat|dag_orchestrat|multi.phase|orchestrat)'; then
  pattern="orchestrator"
elif echo "$desc_lower" | grep -qE '(parallel|\[1\]|\[2\]|\[3\]|\[4\])'; then
  pattern="parallel"
else
  # Infer parallel from agent count: if 2+ agents spawned this session, mark as parallel
  if [ -f "$TASK_COUNT_FILE" ]; then
    session_agent_count=$(cat "$TASK_COUNT_FILE" 2>/dev/null || echo "0")
    if [ "$session_agent_count" -ge 2 ] 2>/dev/null; then
      pattern="parallel"
    fi
  fi
fi

# Duration calculation from start recorder
# ORDERING: This script MUST run BEFORE stall-detection-advisor.sh in hooks.json SubagentStop array.
# Reason: stall-detection-advisor removes consumed entries from AGENT_START_FILE after reading.
AGENT_START_FILE="/tmp/.claude-agent-starts-${PPID}"
duration_seconds=0
if [ -f "$AGENT_START_FILE" ]; then
  start_epoch=$(grep -F "\"agent_type\":\"${agent_type}\"" "$AGENT_START_FILE" 2>/dev/null | tail -1 | jq -r '.start_epoch // "0"' 2>/dev/null || echo "0")
  if [ "$start_epoch" != "0" ] && [ "$start_epoch" != "null" ]; then
    now_epoch=$(date +%s)
    duration_seconds=$((now_epoch - start_epoch))
  fi
fi

# Append JSON line entry
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(jq -n \
  --arg ts "$timestamp" \
  --arg agent "$agent_type" \
  --arg model "$model" \
  --arg outcome "$outcome" \
  --arg pattern "$pattern" \
  --arg skill "$skill_name" \
  --arg desc "$description" \
  --arg err "$error_summary" \
  --arg dur "$duration_seconds" \
  '{timestamp: $ts, agent_type: $agent, model: $model, outcome: $outcome, pattern_used: $pattern, skill: $skill, description: $desc, error_summary: $err, duration_seconds: ($dur | tonumber)}')

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
