#!/usr/bin/env bash
# feedback-collector.sh — Auto-extract failure patterns from session outcomes
# Advisory-only: always exits 0, never blocks session end

set -euo pipefail

# Pass through stdin (Stop hook protocol)
cat > /dev/null

# Dependencies check
command -v jq >/dev/null 2>&1 || exit 0
command -v sqlite3 >/dev/null 2>&1 || exit 0

# PID scoping
OUTCOMES_FILE="/tmp/.claude-task-outcomes-${PPID}"
[ -f "$OUTCOMES_FILE" ] || exit 0

# DB path
DB_PATH="${HOME}/.config/oh-my-customcode/eval-core.sqlite"
[ -f "$DB_PATH" ] || exit 0

# Count failures per agent type
declare -A FAILURE_COUNTS
declare -A TOTAL_COUNTS

while IFS= read -r line; do
  agent_type=$(echo "$line" | jq -r '.agent_type // empty' 2>/dev/null) || continue
  outcome=$(echo "$line" | jq -r '.outcome // empty' 2>/dev/null) || continue
  [ -z "$agent_type" ] && continue

  TOTAL_COUNTS[$agent_type]=$(( ${TOTAL_COUNTS[$agent_type]:-0} + 1 ))
  if [ "$outcome" = "failure" ]; then
    FAILURE_COUNTS[$agent_type]=$(( ${FAILURE_COUNTS[$agent_type]:-0} + 1 ))
  fi
done < "$OUTCOMES_FILE"

# Detect repeated failure agents (3+ failures)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
INSERTED=0

for agent_type in "${!FAILURE_COUNTS[@]}"; do
  count=${FAILURE_COUNTS[$agent_type]}
  total=${TOTAL_COUNTS[$agent_type]:-0}
  [ "$count" -lt 3 ] && continue

  # Determine confidence
  if [ "$count" -ge 5 ]; then
    confidence="high"
  elif [ "$count" -ge 3 ]; then
    confidence="medium"
  else
    confidence="low"
  fi

  # Determine action type
  if [ "$count" -ge 5 ]; then
    action_type="escalate"
  else
    action_type="augment"
  fi

  failure_rate=$(awk "BEGIN {printf \"%.2f\", $count/$total}")
  description="Agent '${agent_type}' failed ${count}/${total} times (${failure_rate} failure rate) in session"

  sqlite3 "$DB_PATH" "INSERT INTO improvementActions (targetType, targetName, actionType, description, confidence, feedbackSource, status, createdAt) VALUES ('agent', '${agent_type}', '${action_type}', '${description}', '${confidence}', 'outcome_derived', 'proposed', '${TIMESTAMP}');" 2>/dev/null || true

  INSERTED=$((INSERTED + 1))
done

if [ "$INSERTED" -gt 0 ]; then
  echo "[feedback-collector] Extracted ${INSERTED} failure pattern(s) from session outcomes" >&2
fi

exit 0
