#!/bin/bash
# PreCompact hook: serialize active task state before context compaction
# Pairs with PostCompact prompt that restores this state

STATE_FILE="/tmp/.claude-task-state-$PPID.json"

collect_state() {
  local pipeline_state=""
  local autonomous=""
  local dev_stage=""
  local tool_count=""
  local loop_count=""

  # Pipeline state
  for f in /tmp/.claude-pipeline-*-$PPID.json; do
    [ -f "$f" ] && pipeline_state=$(cat "$f" 2>/dev/null | jq -c '.' 2>/dev/null) && break
  done

  # Autonomous mode
  [ -f "/tmp/.claude-autonomous-$PPID" ] && autonomous="true"

  # Dev stage (structured-dev-cycle)
  [ -f "/tmp/.claude-dev-stage" ] && dev_stage=$(cat "/tmp/.claude-dev-stage" 2>/dev/null)

  # Tool call counter
  [ -f "/tmp/claude-tool-count-$PPID" ] && tool_count=$(cat "/tmp/claude-tool-count-$PPID" 2>/dev/null)

  # Auto-continue loop count
  [ -f "/tmp/.claude-loop-count-$PPID" ] && loop_count=$(cat "/tmp/.claude-loop-count-$PPID" 2>/dev/null)

  # Build JSON (keep under 500 bytes for context efficiency)
  jq -n \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg pipeline "$pipeline_state" \
    --arg auto "$autonomous" \
    --arg stage "$dev_stage" \
    --arg tools "$tool_count" \
    --arg loops "$loop_count" \
    '{
      captured_at: $ts,
      pipeline: (if $pipeline != "" then ($pipeline | fromjson? // null) else null end),
      autonomous_mode: ($auto == "true"),
      dev_stage: (if $stage != "" then $stage else null end),
      tool_calls: (if $tools != "" then ($tools | tonumber? // null) else null end),
      loop_count: (if $loops != "" then ($loops | tonumber? // null) else null end)
    } | del(.[] | nulls)'
}

state=$(collect_state 2>/dev/null)

if [ -n "$state" ] && [ "$state" != "{}" ]; then
  echo "$state" > "$STATE_FILE"
  echo "[PreCompact] Task state saved to $STATE_FILE" >&2
else
  echo "[PreCompact] No active task state to save" >&2
fi

cat
