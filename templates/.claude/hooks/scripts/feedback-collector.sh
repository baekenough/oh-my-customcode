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

# Log file for error diagnostics
LOG_FILE="/tmp/.claude-feedback-collector-${PPID}.log"

# SQL injection safety: escape single quotes
_sql_escape() { printf '%s' "${1//\'/\'\'}"; }

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

  escaped_agent_type=$(_sql_escape "$agent_type")
  escaped_action_type=$(_sql_escape "$action_type")
  escaped_description=$(_sql_escape "$description")
  escaped_confidence=$(_sql_escape "$confidence")
  escaped_timestamp=$(_sql_escape "$TIMESTAMP")

  sqlite3 "$DB_PATH" "INSERT INTO improvement_actions (target_type, target_name, action_type, description, confidence, feedback_source, status, created_at) VALUES ('agent', '${escaped_agent_type}', '${escaped_action_type}', '${escaped_description}', '${escaped_confidence}', 'outcome_derived', 'proposed', '${escaped_timestamp}');" \
  2>>"$LOG_FILE" || {
    echo "[feedback-collector] INSERT failed for ${agent_type}" >> "$LOG_FILE"
  }

  INSERTED=$((INSERTED + 1))
done

if [ "$INSERTED" -gt 0 ]; then
  echo "[feedback-collector] Extracted ${INSERTED} failure pattern(s) from session outcomes" >&2
fi

exit 0
