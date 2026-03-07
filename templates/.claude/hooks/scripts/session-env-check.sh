#!/bin/bash
set -euo pipefail

# Session Environment Check Hook
# Trigger: SessionStart
# Purpose: Check availability of codex CLI and Agent Teams, report via stderr
# Protocol: stdin JSON -> stdout pass-through, exit 0 always

input=$(cat)

echo "" >&2
echo "--- [Session Environment Check] ---" >&2

# Check codex CLI availability
CODEX_STATUS="unavailable"
if command -v codex >/dev/null 2>&1; then
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    CODEX_STATUS="available (authenticated)"
  else
    CODEX_STATUS="installed but OPENAI_API_KEY not set"
  fi
fi

# Check Agent Teams availability
AGENT_TEAMS_STATUS="disabled"
if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}" = "1" ]; then
  AGENT_TEAMS_STATUS="enabled"
fi

# Git workflow reminder
CURRENT_BRANCH="unknown"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
fi

# Write status to file for other hooks to reference
STATUS_FILE="/tmp/.claude-env-status-${PPID}"
cat > "$STATUS_FILE" << ENVEOF
codex=${CODEX_STATUS}
agent_teams=${AGENT_TEAMS_STATUS}
git_branch=${CURRENT_BRANCH}
ENVEOF

# Report to stderr (visible in conversation)
echo "  codex CLI: ${CODEX_STATUS}" >&2
echo "  Agent Teams: ${AGENT_TEAMS_STATUS}" >&2
echo "" >&2
echo "  [Git Workflow Reminder]" >&2
echo "  Current branch: ${CURRENT_BRANCH}" >&2
if [ "$CURRENT_BRANCH" = "develop" ] || [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "  ⚠ You are on a protected branch!" >&2
  echo "  ⚠ Create a feature branch before making changes:" >&2
  echo "    git checkout -b feat/your-feature develop" >&2
else
  echo "  ✓ Feature branch detected" >&2
fi
echo "  Rules: feature branch → commit → push → PR → merge" >&2
echo "------------------------------------" >&2

# Pass through
echo "$input"
exit 0
