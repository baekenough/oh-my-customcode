#!/bin/bash
# PreCompact Hook - Save state before context compaction
#
# Runs before Claude compacts context. Logs the event and marks
# active session files so you know when compaction occurred.
#
# Hook config (in ~/.claude/settings.json):
# {
#   "hooks": {
#     "PreCompact": [{
#       "matcher": "*",
#       "hooks": [{
#         "type": "command",
#         "command": "~/.claude/hooks/memory-persistence/pre-compact.sh"
#       }]
#     }]
#   }
# }

SESSIONS_DIR="${HOME}/.claude/sessions"
LOG_FILE="${SESSIONS_DIR}/compaction-log.txt"

mkdir -p "$SESSIONS_DIR"

# Log the compaction event
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Context compaction triggered" >> "$LOG_FILE"

# Find and mark active session file
ACTIVE_SESSION=$(find "$SESSIONS_DIR" -name "*.tmp" -mmin -60 2>/dev/null | head -1)
if [ -n "$ACTIVE_SESSION" ] && [ -f "$ACTIVE_SESSION" ]; then
  echo "" >> "$ACTIVE_SESSION"
  echo "---" >> "$ACTIVE_SESSION"
  echo "**[COMPACTION]** Context compacted at $(date '+%H:%M')" >> "$ACTIVE_SESSION"
  echo "---" >> "$ACTIVE_SESSION"
fi

echo "[PreCompact] State preserved before compaction" >&2
