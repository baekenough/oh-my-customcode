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

# Claude Code version detection
CLAUDE_VERSION="unknown"
if command -v claude >/dev/null 2>&1; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
fi

# Version compatibility check
MIN_COMPAT_VERSION="2.1.63"
COMPAT_STATUS="unknown"
if [ "$CLAUDE_VERSION" != "unknown" ]; then
  if printf '%s\n' "$MIN_COMPAT_VERSION" "$CLAUDE_VERSION" | sort -V | head -1 | grep -q "^${MIN_COMPAT_VERSION}$"; then
    COMPAT_STATUS="compatible"
  else
    COMPAT_STATUS="outdated"
  fi
fi

# Git workflow reminder
CURRENT_BRANCH="unknown"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
fi

# Drift Detection: compare git HEAD between sessions
DRIFT_STATUS="not-git"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  SESSION_STATE_DIR="$HOME/.claude/session-state"
  mkdir -p "$SESSION_STATE_DIR"

  PROJECT_HASH=$(echo "$(pwd)" | md5 2>/dev/null || echo "$(pwd)" | md5sum 2>/dev/null | cut -c1-8)
  # md5 on macOS outputs "MD5 (stdin) = <hash>", extract just the hash
  PROJECT_HASH=$(echo "$PROJECT_HASH" | grep -oE '[a-f0-9]{32}' | cut -c1-8)
  STATE_FILE="${SESSION_STATE_DIR}/${PROJECT_HASH}.last-head"

  CURRENT_HEAD=$(git log -1 --format="%H" 2>/dev/null || echo "")

  if [ -n "$CURRENT_HEAD" ]; then
    if [ -f "$STATE_FILE" ]; then
      LAST_HEAD=$(cat "$STATE_FILE" 2>/dev/null || echo "")
      if [ -n "$LAST_HEAD" ] && [ "$LAST_HEAD" != "$CURRENT_HEAD" ]; then
        DRIFT_STATUS="drifted"
        NEW_COMMITS=$(git rev-list --count "${LAST_HEAD}..${CURRENT_HEAD}" 2>/dev/null || echo "?")
        CHANGED_FILES=$(git diff --name-only "${LAST_HEAD}..${CURRENT_HEAD}" 2>/dev/null | head -10)
      else
        DRIFT_STATUS="clean"
      fi
    else
      DRIFT_STATUS="first-session"
    fi

    # Save current HEAD for next session
    echo "$CURRENT_HEAD" > "$STATE_FILE"
  fi
fi

# Update availability check (local cache only — no network calls)
OMCUSTOM_UPDATE_STATUS="unknown"
INSTALLED_VERSION=""
CACHED_LATEST=""

# Read installed version from .omcustomrc.json
if [ -f ".omcustomrc.json" ]; then
  INSTALLED_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .omcustomrc.json 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"')
fi

# Read cached latest version (no network call)
CACHE_FILE="$HOME/.oh-my-customcode/self-update-cache.json"
if [ -f "$CACHE_FILE" ]; then
  CACHED_LATEST=$(grep -o '"latestVersion"[[:space:]]*:[[:space:]]*"[^"]*"' "$CACHE_FILE" 2>/dev/null | grep -o '"[^"]*"$' | tr -d '"')
fi

if [ -n "$INSTALLED_VERSION" ] && [ -n "$CACHED_LATEST" ]; then
  if [ "$INSTALLED_VERSION" != "$CACHED_LATEST" ]; then
    # Simple version comparison using sort -V
    OLDER=$(printf '%s\n' "$INSTALLED_VERSION" "$CACHED_LATEST" | sort -V | head -1)
    if [ "$OLDER" = "$INSTALLED_VERSION" ] && [ "$INSTALLED_VERSION" != "$CACHED_LATEST" ]; then
      OMCUSTOM_UPDATE_STATUS="available"
    else
      OMCUSTOM_UPDATE_STATUS="up-to-date"
    fi
  else
    OMCUSTOM_UPDATE_STATUS="up-to-date"
  fi
elif [ -n "$INSTALLED_VERSION" ]; then
  OMCUSTOM_UPDATE_STATUS="no-cache"
else
  OMCUSTOM_UPDATE_STATUS="not-installed"
fi

# Write status to file for other hooks to reference
STATUS_FILE="/tmp/.claude-env-status-${PPID}"
cat > "$STATUS_FILE" << ENVEOF
codex=${CODEX_STATUS}
agent_teams=${AGENT_TEAMS_STATUS}
git_branch=${CURRENT_BRANCH}
claude_version=${CLAUDE_VERSION}
compat_status=${COMPAT_STATUS}
drift_status=${DRIFT_STATUS}
omcustom_update=${OMCUSTOM_UPDATE_STATUS}
ENVEOF

# Report to stderr (visible in conversation)
echo "  codex CLI: ${CODEX_STATUS}" >&2
echo "  Agent Teams: ${AGENT_TEAMS_STATUS}" >&2
echo "  Claude Code: v${CLAUDE_VERSION} (${COMPAT_STATUS})" >&2
if [ "$COMPAT_STATUS" = "outdated" ]; then
  echo "  ⚠ Claude Code v${MIN_COMPAT_VERSION}+ recommended for full hook compatibility" >&2
fi
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
echo "" >&2

# Drift Detection report
echo "  [Drift Detection]" >&2
case "$DRIFT_STATUS" in
  drifted)
    echo "  ⚠ Repository changed since last session" >&2
    echo "  New commits: ${NEW_COMMITS}" >&2
    if [ -n "${CHANGED_FILES:-}" ]; then
      echo "  Changed files:" >&2
      echo "$CHANGED_FILES" | while IFS= read -r file; do
        echo "    - ${file}" >&2
      done
    fi
    ;;
  clean)
    echo "  ✓ No changes since last session" >&2
    ;;
  first-session)
    echo "  First session for this project" >&2
    ;;
  not-git)
    echo "  Skipped (not a git repository)" >&2
    ;;
esac
echo "------------------------------------" >&2

# Update Check report
echo "" >&2
echo "  [Update Check]" >&2
if [ -n "$INSTALLED_VERSION" ] && [ -n "$CACHED_LATEST" ]; then
  if [ "$OMCUSTOM_UPDATE_STATUS" = "available" ]; then
    echo "  ⚡ oh-my-customcode v${CACHED_LATEST} available (current: v${INSTALLED_VERSION})" >&2
    echo "     Run 'omcustom update' to apply" >&2
  else
    echo "  ✓ oh-my-customcode is up to date (v${INSTALLED_VERSION})" >&2
  fi
elif [ -n "$INSTALLED_VERSION" ]; then
  echo "  ℹ oh-my-customcode v${INSTALLED_VERSION} (run 'omcustom doctor --updates' to check for updates)" >&2
else
  echo "  ℹ oh-my-customcode not detected in this project" >&2
fi
echo "------------------------------------" >&2

# Pass through
echo "$input"
exit 0
