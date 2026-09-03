#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Task/Agent Outcome Recorder Hook
# Trigger: SubagentStop (settings.json wires this script to that event and no other)
# Purpose: Record agent outcomes for model escalation decisions
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always
#
# MEASURED SubagentStop payload (CC 2.1.259 embedded hook schema; #1656 B):
#   session_id, transcript_path, cwd, prompt_id?, permission_mode?, effort?,
#   hook_event_name:"SubagentStop", stop_hook_active, agent_id,
#   agent_transcript_path, agent_type,
#   last_assistant_message?, background_tasks?, session_crons?
#
# Note what the event does NOT carry: no `tool_input`, no `tool_output`, no
# `model`, no `description`, no `prompt`, and no error signal of any kind. The
# selectors below therefore read the top-level fields first and fall back to
# `last_assistant_message` — the one text-bearing field SubagentStop provides —
# for the description and skill-name extraction. The `tool_input`/`tool_output`
# branches are retained as fallbacks so the script stays correct if it is ever
# re-wired to PostToolUse.
#
# This project's transcript corpus (889 files) holds ZERO SubagentStop hook
# records — SubagentStop output is not attached to the parent transcript — so
# the shape above is schema-derived, not corpus-derived.
#
# Outcome caveat: SubagentStop exposes no failure signal, so entries recorded
# from that event are always outcome=success. There is no working hand-off for
# that gap today: SubagentStop payload carries no failure signal;
# subagent-failure-advisor.sh currently reads `.tool_output.is_error`, which is
# absent here, so failure detection on this path is 0 until #1656 G is resolved.

input=$(cat)

# Non-object stdin guard (#1650 B): a hook must never crash on garbage stdin.
# jq's parse error propagates through `set -euo pipefail` as rc=5 without this.
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# Extract agent info. Measured SubagentStop fields come first; the PostToolUse
# `tool_input.*` shape is kept as a fallback.
# `?` suppresses "Cannot index string with ..." when tool_input arrives as a scalar;
# `tostring` normalises a scalar (e.g. a numeric agent_type) instead of aborting.
agent_type=$(printf '%s\n' "$input" | jq -r \
  '(.agent_type? // .tool_input?.subagent_type? // "unknown") | tostring' 2>/dev/null) \
  || agent_type="unknown"
# SubagentStop carries no `model`; this resolves to "inherit" there by design.
model=$(printf '%s\n' "$input" | jq -r \
  '(.model? // .tool_input?.model? // "inherit") | tostring' 2>/dev/null) || model="inherit"
# `strings` drops non-string shapes so an object-valued field degrades to "" rather
# than dumping raw JSON into the description.
description=$(printf '%s\n' "$input" | jq -r '
  [ (.tool_input?.description? | strings),
    (.description?             | strings),
    (.last_assistant_message?  | strings) ]
  | map(select(. != "")) | first // ""
' 2>/dev/null | head -c 200) || description=""

# Extract skill name from description or prompt
skill_name=""
# `|| true`: a no-match grep exits 1 and `set -euo pipefail` would abort the hook
# (measured rc=1 on empty stdin AND on a well-formed object with no skill name).
if echo "$description" | grep -qiE '(skill:|routing|→.*skill)'; then
  skill_name=$(echo "$description" | grep -oiE '[a-z]+-[a-z]+(-[a-z]+)*-?(routing|skill|practices|detection|decomposition|orchestration|pipeline|guards|cycle|plan|review|refactor|publish|version|audit|exec|analyze|bundle|report|setup|watch|lists|status|help|save|recall)' | head -1 || true)
fi
# Fallback: check the prompt / last assistant message for a "Skill: {name}" pattern.
# SubagentStop has no `prompt`, so `last_assistant_message` is the live source here.
if [ -z "$skill_name" ]; then
  prompt=$(printf '%s\n' "$input" | jq -r '
    [ (.tool_input?.prompt?      | strings),
      (.last_assistant_message?  | strings) ]
    | map(select(. != "")) | first // ""
  ' 2>/dev/null | head -c 500) || prompt=""
  # POSIX character classes, not `\s`: BSD sed (macOS, this repo's runtime) does not
  # implement the GNU `\s` escape, so `s/[Ss]kill:\s*//` stripped only the colon and
  # left a leading space on every extracted skill name. Same family as the BSD `\?`
  # gap recorded in R005. (#1656 B)
  skill_name=$(echo "$prompt" | grep -oiE 'Skill:[[:space:]]*[a-z]+-[a-z]+(-[a-z]+)*' | sed 's/[Ss]kill:[[:space:]]*//' | head -1 || true)
fi

# Determine outcome. SubagentStop carries no error signal, so this is always false
# there; `.tool_response.is_error` is the measured PostToolUse field (`.tool_output`
# is the legacy shape) and both are kept for re-wiring safety.
is_error=$(printf '%s\n' "$input" | jq -r '
  (.tool_response?.is_error? // .tool_output?.is_error? // false) | tostring
' 2>/dev/null) || is_error="false"

if [ "$is_error" = "true" ]; then
  outcome="failure"
  error_summary=$(printf '%s\n' "$input" | jq -r '
    [ (.tool_response?.output? | strings),
      (.tool_output?.output?   | strings) ]
    | map(select(. != "")) | first // ""
  ' 2>/dev/null | head -c 200) || error_summary=""
else
  outcome="success"
  error_summary=""
fi

# Session-scoped outcome log and agent count tracker
OUTCOME_FILE="/tmp/.claude-task-outcomes-${PPID}"
TASK_COUNT_FILE="/tmp/.claude-task-count-${PPID}"

# --- Pattern Detection ---
# Priority: skill-specific patterns > parallel > agent-count inference > default.
#
# INPUT SCOPE (#1656 D): the cascade below reads ONLY `tool_input.description` —
# the spawn argument the orchestrator wrote — never `$description`, which now
# falls back to `last_assistant_message`, i.e. free-form prose the subagent wrote
# about itself. A closing summary that merely says "ran the parallel review" or
# "orchestrator finished" would otherwise be recorded as
# pattern_used=parallel/orchestrator, fabricating a workflow shape out of English.
# SubagentStop carries no `tool_input`, so on that event this source is empty and
# the pattern degrades to the session-level agent-count signal (a real, non-prose
# signal) and then to "unknown" — an honest absence rather than a default
# "sequential" that reads as a measurement.
pattern_source=$(printf '%s\n' "$input" | jq -r '
  (.tool_input?.description? | strings) // ""
' 2>/dev/null | head -c 200) || pattern_source=""

if [ -n "$pattern_source" ]; then
  pattern="sequential"
else
  pattern="unknown"
fi

desc_lower=$(printf '%s' "$pattern_source" | tr '[:upper:]' '[:lower:]')

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

# Append JSON line entry.
# `-c` (compact) is REQUIRED, not cosmetic: this file is consumed as JSONL by
# eval-core's outcome-parser (`content.split('\n')` + `JSON.parse(line)`) and by
# model-escalation-advisor.sh (`grep -c '"agent_type":"X".*"outcome":"failure"'`,
# `tail -N`), and the ring buffer below trims by `wc -l`. A pretty-printed entry
# spans 11 lines (measured: 9 fields plus the braces), so it broke every one of
# those readers and let `tail -50` slice
# an object in half. Sibling recorders (agent-start-recorder.sh, stuck-detector.sh)
# already use `jq -cn`. (#1656 B)
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(jq -cn \
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

printf '%s\n' "$entry" >> "$OUTCOME_FILE"

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
printf '%s\n' "$input"
exit 0
