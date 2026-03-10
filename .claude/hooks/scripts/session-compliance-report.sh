#!/bin/bash
# Stop hook: Session compliance report (R265 Phase 1)
# Reads violation logs collected by PreToolUse hooks during the session
# Advisory only — never blocks session termination
# Ref: https://github.com/baekenough/oh-my-customcode/issues/265

set -euo pipefail

input=$(cat)

VIOLATIONS_FILE="/tmp/.claude-violations-${PPID}"
TASK_COUNT_FILE="/tmp/.claude-task-count-${PPID}"

echo "" >&2
echo "╔══════════════════════════════════════════════╗" >&2
echo "║        Session Compliance Report             ║" >&2
echo "╚══════════════════════════════════════════════╝" >&2

# Count total Agent/Task calls
if [ -f "$TASK_COUNT_FILE" ]; then
  TOTAL_TASKS=$(cat "$TASK_COUNT_FILE")
  echo "[Compliance] Agent/Task calls this session: ${TOTAL_TASKS}" >&2
else
  TOTAL_TASKS=0
  echo "[Compliance] Agent/Task calls this session: 0" >&2
fi

# Check violations
if [ -f "$VIOLATIONS_FILE" ] && [ -s "$VIOLATIONS_FILE" ]; then
  VIOLATION_COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d ' ')
  echo "[Compliance] Violations detected: ${VIOLATION_COUNT}" >&2
  echo "" >&2

  # Group by rule
  R010_COUNT=$(grep -c '"rule":"R010"' "$VIOLATIONS_FILE" 2>/dev/null || echo "0")
  R018_COUNT=$(grep -c '"rule":"R018"' "$VIOLATIONS_FILE" 2>/dev/null || echo "0")

  if [ "$R010_COUNT" -gt 0 ]; then
    echo "  R010 (Git Delegation): ${R010_COUNT} violation(s)" >&2
    grep '"rule":"R010"' "$VIOLATIONS_FILE" | jq -r '.detail' 2>/dev/null | while read -r detail; do
      echo "    - ${detail}" >&2
    done
  fi

  if [ "$R018_COUNT" -gt 0 ]; then
    echo "  R018 (Agent Teams): ${R018_COUNT} violation(s)" >&2
    grep '"rule":"R018"' "$VIOLATIONS_FILE" | jq -r '.detail' 2>/dev/null | while read -r detail; do
      echo "    - ${detail}" >&2
    done
  fi

  echo "" >&2
  echo "[Compliance] Review violations above and consider rule updates per R016." >&2
else
  echo "[Compliance] No violations detected. All clear!" >&2
fi

echo "────────────────────────────────────────────────" >&2

# Cleanup temp files (best effort)
rm -f "$VIOLATIONS_FILE" 2>/dev/null || true

# CRITICAL: Always pass through input and exit 0
echo "$input"
exit 0
