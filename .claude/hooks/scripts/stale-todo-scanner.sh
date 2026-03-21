#!/bin/bash
set -euo pipefail

# Stale TODO Scanner Hook
# Trigger: SessionStart
# Purpose: Scan TODO.md files for staleness and pending items, report via stderr
# Protocol: stdin JSON -> stdout pass-through, exit 0 always
# Note: Zero network calls — local file scanning only

input=$(cat)

TODO_FILES=("TODO.md" ".claude/TODO.md")
NOW=$(date +%s)
FOUND_ANY=false
FOUND_STALE=false

echo "" >&2
echo "--- [TODO Health Check] ---" >&2

for TODO_FILE in "${TODO_FILES[@]}"; do
  if [ ! -f "$TODO_FILE" ]; then
    continue
  fi

  FOUND_ANY=true

  # Parse "Last updated: YYYY-MM-DD" header
  LAST_UPDATED_LINE=$(grep -m1 "> Last updated:" "$TODO_FILE" 2>/dev/null || echo "")
  DATE_STR=$(echo "$LAST_UPDATED_LINE" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || echo "")

  # Count pending items (grep -c exits 1 when no matches on some systems — normalize to 0)
  PENDING_COUNT=$(grep -c "^- \[ \]" "$TODO_FILE" 2>/dev/null) || PENDING_COUNT=0

  if [ -z "$DATE_STR" ]; then
    echo "  ${TODO_FILE}: no 'Last updated' header found" >&2
    echo "    Pending items: ${PENDING_COUNT}" >&2
    continue
  fi

  # Cross-platform date parsing: try GNU date first, fallback to BSD date
  FILE_EPOCH=""
  if date -d "$DATE_STR" +%s >/dev/null 2>&1; then
    # GNU date (Linux)
    FILE_EPOCH=$(date -d "$DATE_STR" +%s)
  elif date -j -f "%Y-%m-%d" "$DATE_STR" +%s >/dev/null 2>&1; then
    # BSD date (macOS)
    FILE_EPOCH=$(date -j -f "%Y-%m-%d" "$DATE_STR" +%s)
  else
    echo "  ${TODO_FILE}: could not parse date '${DATE_STR}'" >&2
    echo "    Pending items: ${PENDING_COUNT}" >&2
    continue
  fi

  DAYS_OLD=$(( (NOW - FILE_EPOCH) / 86400 ))

  if [ "$DAYS_OLD" -gt 30 ]; then
    STATUS="⚠⚠ critical — stale >30d"
    FOUND_STALE=true
  elif [ "$DAYS_OLD" -gt 7 ]; then
    STATUS="⚠ stale >7d"
    FOUND_STALE=true
  else
    STATUS="up to date"
  fi

  echo "  ${TODO_FILE}: last updated ${DAYS_OLD} days ago (${STATUS})" >&2
  echo "    Pending items: ${PENDING_COUNT}" >&2
done

if [ "$FOUND_ANY" = false ] || [ "$FOUND_STALE" = false ]; then
  if [ "$FOUND_ANY" = false ]; then
    : # No TODO files found — skip silently
  else
    echo "  ✓ All TODO files are up to date" >&2
  fi
fi

echo "------------------------------------" >&2

# Pass through
echo "$input"
exit 0
