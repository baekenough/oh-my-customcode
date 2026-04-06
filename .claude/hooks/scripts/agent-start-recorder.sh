#!/bin/bash
set -euo pipefail

# Agent Start Recorder
# Trigger: SubagentStart
# Purpose: Record agent spawn time for stall detection duration calculations
# Protocol: stdin JSON -> record start time -> stdout pass-through, exit 0 always (R021 advisory)

command -v jq >/dev/null 2>&1 || { cat; exit 0; }

input=$(cat)

agent_type=$(echo "$input" | jq -r '.agent_type // "unknown"')
model=$(echo "$input" | jq -r '.model // "inherit"')
description=$(echo "$input" | jq -r '.description // ""' | head -c 80)

AGENT_START_FILE="/tmp/.claude-agent-starts-${PPID}"

timestamp=$(date +%s)

entry=$(jq -cn \
  --arg ts "$timestamp" \
  --arg agent "$agent_type" \
  --arg model "$model" \
  --arg desc "$description" \
  '{start_epoch: $ts, agent_type: $agent, model: $model, description: $desc}')

echo "$entry" >> "$AGENT_START_FILE"

# Ring buffer: 50 max
if [ -f "$AGENT_START_FILE" ]; then
  line_count=$(wc -l < "$AGENT_START_FILE" | tr -d ' ')
  if [ "$line_count" -gt 50 ]; then
    tail -50 "$AGENT_START_FILE" > "${AGENT_START_FILE}.tmp"
    mv "${AGENT_START_FILE}.tmp" "$AGENT_START_FILE"
  fi
fi

echo "$input"
exit 0
