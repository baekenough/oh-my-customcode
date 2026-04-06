#!/bin/bash
set -euo pipefail

# Stall Detection Advisor
# Trigger: SubagentStop
# Purpose: Detect stalled parallel agents and advise adaptive splitting (R009)
# Protocol: stdin JSON -> analyze durations -> stderr advisory, stdout pass-through, exit 0 always (R021)

# ORDERING: This hook MUST run AFTER task-outcome-recorder.sh in hooks.json SubagentStop array.
# Reason: This script removes consumed entries from AGENT_START_FILE; task-outcome-recorder reads them first.

command -v jq >/dev/null 2>&1 || { cat; exit 0; }

input=$(cat)

AGENT_START_FILE="/tmp/.claude-agent-starts-${PPID}"
DURATION_FILE="/tmp/.claude-agent-durations-${PPID}"

# Skip if no start records exist
[ -f "$AGENT_START_FILE" ] || { echo "$input"; exit 0; }

# --- 1. Extract completed agent info ---
agent_type=$(echo "$input" | jq -r '.agent_type // "unknown"')
model=$(echo "$input" | jq -r '.model // "inherit"')
description=$(echo "$input" | jq -r '.description // ""' | head -c 80)

# --- 2. Calculate duration from start record ---
start_epoch=$(grep -F "\"agent_type\":\"${agent_type}\"" "$AGENT_START_FILE" 2>/dev/null | tail -1 | jq -r '.start_epoch // "0"' 2>/dev/null || echo "0")

if [ "$start_epoch" = "0" ] || [ "$start_epoch" = "null" ]; then
  echo "$input"
  exit 0
fi

now_epoch=$(date +%s)
duration_seconds=$((now_epoch - start_epoch))

# Guard against negative duration (NTP adjustment, clock skew)
if [ "$duration_seconds" -lt 0 ]; then duration_seconds=0; fi

# --- 3. Stall detection (BEFORE recording this agent's duration, so self is excluded from average) ---
# Need at least 1 completed peer to calculate average
if [ -f "$DURATION_FILE" ]; then
  completed_count=$(wc -l < "$DURATION_FILE" | tr -d ' ')
else
  completed_count=0
fi

if [ "$completed_count" -ge 1 ]; then
  # Calculate average duration of completed agents (null-safe)
  avg_duration=$(jq -s '[.[].duration_seconds | numbers] | if length == 0 then 0 else add / length | floor end' "$DURATION_FILE" 2>/dev/null || echo "0")

  if [ "$avg_duration" -gt 0 ]; then
    stall_threshold=$((avg_duration * 2))

    # Check for still-running agents (in start file but not in duration file)
    if [ -f "$AGENT_START_FILE" ] && [ -s "$AGENT_START_FILE" ]; then
      while IFS= read -r line; do
        running_agent=$(echo "$line" | jq -r '.agent_type // ""' 2>/dev/null || true)
        running_start=$(echo "$line" | jq -r '.start_epoch // "0"' 2>/dev/null || echo "0")
        running_desc=$(echo "$line" | jq -r '.description // ""' 2>/dev/null || true)
        running_model=$(echo "$line" | jq -r '.model // "inherit"' 2>/dev/null || true)

        if [ "$running_start" = "0" ] || [ "$running_start" = "null" ]; then continue; fi

        elapsed=$((now_epoch - running_start))

        if [ "$elapsed" -gt "$stall_threshold" ]; then
          # --- Emit advisory (stderr) ---
          echo "" >&2
          echo "─── [Stall Detection Advisory] ───────────────────────────" >&2
          echo "  Stalled: ${running_agent}:${running_model} (${elapsed}s elapsed, 2x avg ${avg_duration}s)" >&2
          echo "  Description: ${running_desc}" >&2
          echo "  ⚡ Consider spawning independent pending tasks immediately" >&2
          echo "  R009 Adaptive Parallel Splitting applies" >&2
          echo "──────────────────────────────────────────────────────────" >&2
          echo "" >&2
        fi
      done < "$AGENT_START_FILE"
    fi
  fi
fi

# --- 4. Record duration (AFTER stall detection so self is excluded from average) ---
duration_entry=$(jq -cn \
  --arg agent "$agent_type" \
  --arg model "$model" \
  --arg desc "$description" \
  --arg dur "$duration_seconds" \
  --arg ts "$now_epoch" \
  '{agent_type: $agent, model: $model, description: $desc, duration_seconds: ($dur | tonumber), timestamp: $ts}')

echo "$duration_entry" >> "$DURATION_FILE"

# Remove only first consumed start entry (preserve siblings for parallel same-type agents)
if [ -f "$AGENT_START_FILE" ]; then
  awk -v pat="\"agent_type\":\"${agent_type}\"" 'found || $0 !~ pat { print; next } { found=1 }' "$AGENT_START_FILE" > "${AGENT_START_FILE}.tmp" 2>/dev/null || true
  mv "${AGENT_START_FILE}.tmp" "$AGENT_START_FILE" 2>/dev/null || true
fi

# Ring buffer: 50 max
if [ -f "$DURATION_FILE" ]; then
  line_count=$(wc -l < "$DURATION_FILE" | tr -d ' ')
  if [ "$line_count" -gt 50 ]; then
    tail -50 "$DURATION_FILE" > "${DURATION_FILE}.tmp"
    mv "${DURATION_FILE}.tmp" "$DURATION_FILE"
  fi
fi

# Pass through
echo "$input"
exit 0
