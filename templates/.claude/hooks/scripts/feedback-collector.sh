#!/usr/bin/env bash
# feedback-collector.sh — Auto-extract failure patterns from session outcomes
# Advisory-only: always exits 0, never blocks session end

set -euo pipefail

# Pass through stdin (Stop hook protocol)
input=$(cat)

# Dependencies check
command -v jq >/dev/null 2>&1 || { printf '%s\n' "$input"; exit 0; }
command -v sqlite3 >/dev/null 2>&1 || { printf '%s\n' "$input"; exit 0; }

# PID scoping
OUTCOMES_FILE="/tmp/.claude-task-outcomes-${PPID}"
[ -f "$OUTCOMES_FILE" ] || { printf '%s\n' "$input"; exit 0; }

# DB path
DB_PATH="${HOME}/.config/oh-my-customcode/eval-core.sqlite"
[ -f "$DB_PATH" ] || { printf '%s\n' "$input"; exit 0; }

# Log file for error diagnostics
LOG_FILE="/tmp/.claude-feedback-collector-${PPID}.log"

# SQL injection safety: escape single quotes
# The quote is held in a variable: `${1//\'/\'\'}` keeps the backslashes under bash 3.2 (measured: the INSERT
# then fails with 'unrecognized token "\"'), while bash 5 drops them.
_sql_escape() { local q="'"; printf '%s' "${1//$q/$q$q}"; }

# Count failures per agent type. No associative arrays: `declare -A` needs bash 4, and this hook
# runs under whatever `bash` is first on PATH (bash 3.2 on macOS fails with rc=2 on `declare -A`).
# One jq pass emits "<agent_type><TAB><0|1>" per valid record (malformed lines are skipped); awk
# aggregates and keeps only agent types with 3+ failures.
STATS=$(jq -R -r 'fromjson? | select(type=="object") | select((.agent_type // "") != "") | [.agent_type, (if .outcome == "failure" then 1 else 0 end)] | @tsv' "$OUTCOMES_FILE" 2>/dev/null \
  | awk -F'\t' '{ t[$1]++; f[$1] += $2 } END { for (a in t) if (f[a] >= 3) printf "%s\t%d\t%d\n", a, f[a], t[a] }') || {
  # Under pipefail a jq/awk failure would otherwise drop every stat silently; record it (log file only).
  echo "[feedback-collector] stats aggregation failed (jq/awk); no failure patterns evaluated" >> "$LOG_FILE" 2>/dev/null || true
  STATS=""
}

# Detect repeated failure agents (3+ failures)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
INSERTED=0

while IFS=$'\t' read -r agent_type count total; do
  [ -z "$agent_type" ] && continue
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

  failure_rate=$(awk "BEGIN {printf \"%.2f\", $count/$total}" 2>/dev/null || echo "0.00")
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
done <<< "$STATS"

if [ "$INSERTED" -gt 0 ]; then
  echo "[feedback-collector] Extracted ${INSERTED} failure pattern(s) from session outcomes" >&2
fi

# CRITICAL: Always pass through input and exit 0
# This hook MUST NEVER block session termination
printf '%s\n' "$input"
exit 0
