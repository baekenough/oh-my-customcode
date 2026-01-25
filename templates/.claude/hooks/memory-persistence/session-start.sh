#!/bin/bash
# SessionStart Hook - Load previous context on new session
#
# Runs when a new Claude session starts. Checks for recent session
# files and learned skills to provide continuity hints.
#
# Hook config (in ~/.claude/settings.json):
# {
#   "hooks": {
#     "SessionStart": [{
#       "matcher": "*",
#       "hooks": [{
#         "type": "command",
#         "command": "~/.claude/hooks/memory-persistence/session-start.sh"
#       }]
#     }]
#   }
# }

SESSIONS_DIR="${HOME}/.claude/sessions"
SKILLS_DIR="${HOME}/.claude/skills/learned"

# Check for recent session files (last 7 days)
if [ -d "$SESSIONS_DIR" ]; then
  RECENT_SESSIONS=$(find "$SESSIONS_DIR" -name "*.tmp" -mtime -7 2>/dev/null | wc -l | tr -d ' ')
  if [ "$RECENT_SESSIONS" -gt 0 ]; then
    echo "[SessionStart] Found $RECENT_SESSIONS recent session(s)" >&2
    LATEST=$(find "$SESSIONS_DIR" -name "*.tmp" -mtime -7 2>/dev/null | sort -r | head -1)
    if [ -n "$LATEST" ]; then
      echo "[SessionStart] Latest: $LATEST" >&2
    fi
  fi
fi

# Check for learned skills
if [ -d "$SKILLS_DIR" ]; then
  SKILLS_COUNT=$(find "$SKILLS_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SKILLS_COUNT" -gt 0 ]; then
    echo "[SessionStart] $SKILLS_COUNT learned skill(s) available" >&2
  fi
fi
