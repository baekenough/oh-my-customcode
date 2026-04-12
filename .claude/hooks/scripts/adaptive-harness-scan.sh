#!/bin/bash
# adaptive-harness-scan.sh — Lightweight project profile staleness check
# Runs at SessionStart. Must complete in <2s. Advisory only (never blocks).

set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PROFILE="$PROJECT_ROOT/.claude/project-profile.yaml"

# Skip if this IS the oh-my-customcode project itself (meta-project)
if [ -f "$PROJECT_ROOT/.claude/skills/adaptive-harness/SKILL.md" ] && \
   [ -f "$PROJECT_ROOT/CLAUDE.md" ] && \
   grep -q "oh-my-customcode" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
  # Only check if profile exists for the meta-project
  if [ ! -f "$PROFILE" ]; then
    echo "[adaptive-harness] No project profile found. Run /omcustom:adaptive-harness --scan to generate." >&2
  fi
  exit 0
fi

# For non-omcustom projects
if [ ! -f "$PROFILE" ]; then
  echo "[adaptive-harness] No project profile found. Run /omcustom:adaptive-harness --scan to auto-configure harness." >&2
  exit 0
fi

# Check staleness: if any key project files changed since last scan
PROFILE_MTIME=$(stat -f "%m" "$PROFILE" 2>/dev/null || stat -c "%Y" "$PROFILE" 2>/dev/null || echo "0")
STALE=false

for indicator in package.json go.mod Cargo.toml requirements.txt pyproject.toml build.gradle pom.xml; do
  if [ -f "$PROJECT_ROOT/$indicator" ]; then
    FILE_MTIME=$(stat -f "%m" "$PROJECT_ROOT/$indicator" 2>/dev/null || stat -c "%Y" "$PROJECT_ROOT/$indicator" 2>/dev/null || echo "0")
    if [ "$FILE_MTIME" -gt "$PROFILE_MTIME" ] 2>/dev/null; then
      STALE=true
      break
    fi
  fi
done

if [ "$STALE" = true ]; then
  echo "[adaptive-harness] Project profile may be stale. Consider running /omcustom:adaptive-harness --scan" >&2
fi

exit 0
