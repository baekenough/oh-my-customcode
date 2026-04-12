#!/bin/bash
# Session Auto-Fix Prompt — UserPromptSubmit prompt hook (#838)
# One-shot: reads SessionStart findings and injects into first user prompt.
# Protocol: stdout text -> injected into model context

FIXES_FILE="/tmp/.claude-session-fixes-${PPID}"

# Only fire if findings exist (one-shot)
if [ ! -f "$FIXES_FILE" ]; then
  exit 0
fi

# Read and remove (one-shot: prevent repeated injection)
FINDINGS=$(cat "$FIXES_FILE")
rm -f "$FIXES_FILE"

ISSUE_COUNT=$(echo "$FINDINGS" | jq -r '.issue_count // 0' 2>/dev/null)

if [ "$ISSUE_COUNT" -gt 0 ]; then
  echo "[Session Auto-Fix] Previous session left ${ISSUE_COUNT} issue(s):"
  echo "$FINDINGS" | jq -r '.issues[]' 2>/dev/null | while IFS= read -r issue; do
    type="${issue%%:*}"
    msg="${issue#*:}"
    echo "  - [${type}] ${msg}"
  done
  FIX_COUNT=$(echo "$FINDINGS" | jq -r '.fix_count // 0' 2>/dev/null)
  if [ "$FIX_COUNT" -gt 0 ]; then
    echo "Auto-fixed: ${FIX_COUNT} item(s)."
  fi
  echo ""
  echo "Consider addressing remaining issues before starting new work."
fi

exit 0
