#!/bin/bash
set -euo pipefail

# Session Environment Check Hook
# Trigger: SessionStart
# Purpose: Check availability of codex CLI and the Agent Teams env-var INTENT (#1588),
#          report via stderr
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

# Check Gemini CLI availability
GEMINI_STATUS="unavailable"
if command -v gemini >/dev/null 2>&1; then
  if [ -n "${GOOGLE_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
    GEMINI_STATUS="available (authenticated)"
  else
    GEMINI_STATUS="installed (gcloud auth may be available)"
  fi
fi

# Check RTK CLI availability
RTK_STATUS="unavailable"
if command -v rtk >/dev/null 2>&1; then
  RTK_STATUS="available"
fi

# Check Agent Teams ENV-VAR INTENT — NOT activation (#1588)
#
# R018 Detection (.claude/rules/MUST-agent-teams.md) resolves Agent Teams as ACTIVE only when
# CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 AND TeamCreate is present in the tool list.
# A shell hook CANNOT observe the tool list. MEASURED against @anthropic-ai/claude-code 2.1.233:
#   * SessionStart stdin carries only
#     {session_id, transcript_path, cwd, permission_mode, agent_id, agent_type,
#      hook_event_name, source, model} — NO hook event carries a tool inventory.
#   * availability additionally requires a remote gate and a plan entitlement, neither of
#     which is cached on disk, so the shell cannot read them either.
# The env var is NECESSARY-BUT-NOT-SUFFICIENT. Reporting "enabled" here made
# agent-teams-advisor.sh recommend TeamCreate in an environment where that tool does not exist.
#
# VALUE CONTRACT: agent-teams-advisor.sh reads this via `grep "agent_teams=" | cut -d= -f2`,
# so the value MUST NOT contain '='.
AGENT_TEAMS_STATUS="disabled"
if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}" = "1" ]; then
  AGENT_TEAMS_STATUS="env-set"
  # Escape hatch: the operator has MEASURED TeamCreate in the live tool list (R020 — "the tool
  # exists" is itself a claim requiring measurement). This is the only path that may report
  # activation, because only a human/model can see the tool list.
  if [ "${OMCUSTOM_AGENT_TEAMS_VERIFIED:-0}" = "1" ]; then
    AGENT_TEAMS_STATUS="enabled"
  fi
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

# v2.1.88+ features notice
if [ "$CLAUDE_VERSION" != "unknown" ]; then
  if printf '%s\n' "2.1.88" "$CLAUDE_VERSION" | sort -V | head -1 | grep -q "^2\.1\.88$"; then
    if [ -z "${CLAUDE_CODE_NO_FLICKER:-}" ]; then
      echo "  [v2.1.88] Tip: CLAUDE_CODE_NO_FLICKER=1 for flicker-free rendering" >&2
    fi
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
  # md5 on macOS outputs "MD5 (stdin) = <hash>", extract just the hash.
  # Guarded for the same reason as json_string_field below: on a platform where the fallback
  # already yields an 8-char digest this grep matches nothing and would abort the hook.
  PROJECT_HASH=$(echo "$PROJECT_HASH" | grep -oE '[a-f0-9]{32}' | cut -c1-8 || printf '')
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

# --- CI Status Check ---
# Check last CI run status if gh CLI is available
if command -v gh &>/dev/null; then
  ci_status=$(gh run list --limit 1 --json conclusion -q '.[0].conclusion' 2>/dev/null || echo "unknown")
  ci_name=$(gh run list --limit 1 --json name -q '.[0].name' 2>/dev/null || echo "unknown")
  if [ "$ci_status" = "failure" ]; then
    echo "[Session] ⚠ WARNING: Last CI run FAILED (${ci_name}) — check before pushing" >&2
  elif [ "$ci_status" = "success" ]; then
    echo "[Session] CI: last run passed (${ci_name})" >&2
  elif [ "$ci_status" != "unknown" ]; then
    echo "[Session] CI: last run status: ${ci_status} (${ci_name})" >&2
  fi
fi

# Update availability check (local cache only — no network calls)
OMCUSTOM_UPDATE_STATUS="unknown"
INSTALLED_VERSION=""
CACHED_LATEST=""

# Extract a "<key>": "<value>" pair from a JSON file using grep only (no jq dependency).
# EVERY grep here is guarded with `|| printf ''`: this script runs under `set -euo pipefail`,
# where an unmatched grep exits 1 and (via pipefail) kills the ENTIRE SessionStart hook —
# measured as exit 1 with 0 bytes of stdout and 11 failing tests, including the script's own
# "should always exit with code 0" contract (#1570).
json_string_field() {
  local file="$1" key="$2"
  grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" 2>/dev/null \
    | head -1 \
    | grep -o '"[^"]*"$' \
    | tr -d '"' \
    || printf ''
}

# Read installed version from .omcustomrc.json
if [ -f ".omcustomrc.json" ]; then
  INSTALLED_VERSION=$(json_string_field ".omcustomrc.json" "version")
fi

# Read cached latest version (no network call).
#
# Schema note (MEASURED 2026-08-10, #1570): TWO writers produce this exact path with
# DIFFERENT key names, and BOTH are current — neither is a legacy schema:
#   * .claude/hooks/scripts/omcustom-auto-update.sh → {"version","timestamp","source"}
#   * src/core/self-update.ts  writeCache()         → {"checkedAt","latestVersion"}
# The live cache on this machine was the auto-update shape ({source,timestamp,version}), so
# the hard-coded "latestVersion" lookup matched nothing. Read `latestVersion` first, then fall
# back to `version`. The `"version"` pattern includes the opening quote, so it cannot
# accidentally match the tail of `"latestVersion"`.
CACHE_FILE="$HOME/.oh-my-customcode/self-update-cache.json"
if [ -f "$CACHE_FILE" ]; then
  CACHED_LATEST=$(json_string_field "$CACHE_FILE" "latestVersion")
  if [ -z "$CACHED_LATEST" ]; then
    CACHED_LATEST=$(json_string_field "$CACHE_FILE" "version")
  fi
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
gemini=${GEMINI_STATUS}
rtk=${RTK_STATUS}
agent_teams=${AGENT_TEAMS_STATUS}
git_branch=${CURRENT_BRANCH}
claude_version=${CLAUDE_VERSION}
compat_status=${COMPAT_STATUS}
drift_status=${DRIFT_STATUS}
omcustom_update=${OMCUSTOM_UPDATE_STATUS}
ENVEOF

# Report to stderr (visible in conversation)
echo "  codex CLI: ${CODEX_STATUS}" >&2
echo "  gemini CLI: ${GEMINI_STATUS}" >&2
echo "  RTK CLI:      ${RTK_STATUS}" >&2
echo "  Agent Teams: ${AGENT_TEAMS_STATUS}" >&2
if [ "$AGENT_TEAMS_STATUS" = "env-set" ]; then
  echo "    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is set — this is INTENT, not activation." >&2
  echo "    R018 also requires TeamCreate in the tool list; a shell hook cannot observe it." >&2
  echo "    Confirm TeamCreate before treating R018 as active (OMCUSTOM_AGENT_TEAMS_VERIFIED=1)." >&2
fi
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
echo "" >&2
echo "  [Lockfile Drift]" >&2
echo "  Note: file-level lockfile drift (template hash changes) is checked via 'omcustom doctor'" >&2
echo "  Run 'omcustom doctor' to detect modified/removed template files since install." >&2
echo "------------------------------------" >&2

# SessionEnd hooks timeout (v2.1.74+)
if [ -z "${CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS:-}" ]; then
  echo "[SessionEnv] ⚠ CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS not set (default: 1500ms)" >&2
  echo "[SessionEnv] Recommend: export CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS=10000" >&2
fi

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
printf '%s\n' "$input"
exit 0
