#!/bin/bash
# Strategic Compact Suggester - Suggest manual compaction at logical intervals
#
# Tracks tool usage and suggests compaction at strategic points.
# Manual compaction preserves context through logical phases.
#
# Best times to compact:
# - After completing an exploration phase, before starting execution
# - After reaching a milestone (feature complete, tests passing)
# - When context feels cluttered but before it auto-compacts
#
# Hook config (in ~/.claude/settings.json):
# {
#   "hooks": {
#     "PreToolUse": [{
#       "matcher": "tool == \"Edit\" || tool == \"Write\"",
#       "hooks": [{
#         "type": "command",
#         "command": "~/.claude/hooks/strategic-compact/suggest-compact.sh"
#       }]
#     }]
#   }
# }

COUNTER_FILE="/tmp/claude-tool-count-$$"
THRESHOLD=${COMPACT_THRESHOLD:-50}

# Initialize or increment counter
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
echo "$COUNT" > "$COUNTER_FILE"

# Suggest compaction at threshold
if [ "$COUNT" -eq "$THRESHOLD" ]; then
  echo "[StrategicCompact] Reached $THRESHOLD tool calls" >&2
  echo "[StrategicCompact] Consider running /compact if at a logical breakpoint" >&2
  echo "[StrategicCompact] Good times: after exploration, before implementation" >&2
fi

# Reminder every 25 calls after threshold
if [ "$COUNT" -gt "$THRESHOLD" ] && [ $(((COUNT - THRESHOLD) % 25)) -eq 0 ]; then
  echo "[StrategicCompact] $COUNT tool calls - /compact reminder" >&2
fi

# Pass through input
cat
