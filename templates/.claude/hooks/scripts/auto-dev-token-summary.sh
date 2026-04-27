#!/usr/bin/env bash
set -euo pipefail

# auto-dev Token Spend Summary (Issue #1057, Option 1)
# Trigger: Stop event
# Purpose: Print phase-by-phase token spend table to stderr
# Protocol: stdin pass-through, stderr summary, exit 0 always

input=$(cat 2>/dev/null || true)
trap 'printf "%s" "$input"' EXIT

LOG_FILE="/tmp/auto-dev-spend-${PPID}.json"
[ -f "$LOG_FILE" ] || exit 0
[ -s "$LOG_FILE" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

# Aggregate per phase: sum tokens_in, tokens_out, count entries
summary=$(jq -s -r '
  group_by(.phase)
  | map({
      phase: .[0].phase,
      calls: length,
      tokens_in: (map(.tokens_in) | add),
      tokens_out: (map(.tokens_out) | add),
      total: (map(.tokens_in + .tokens_out) | add)
    })
  | sort_by(-.total)
' "$LOG_FILE" 2>/dev/null) || exit 0

[ -z "$summary" ] && exit 0
[ "$summary" = "[]" ] && exit 0

# Totals
totals=$(echo "$summary" | jq -r '
  {
    total_calls: (map(.calls) | add),
    total_in: (map(.tokens_in) | add),
    total_out: (map(.tokens_out) | add),
    grand: (map(.total) | add)
  }
')
total_calls=$(echo "$totals" | jq -r '.total_calls')
total_in=$(echo "$totals" | jq -r '.total_in')
total_out=$(echo "$totals" | jq -r '.total_out')
grand=$(echo "$totals" | jq -r '.grand')

{
  echo ""
  echo "=== [auto-dev Token Spend Summary] (Issue #1057, advisory) ==="
  echo "Source: $LOG_FILE  |  Heuristic: bytes ÷ 4"
  echo ""
  printf "| %-32s | %5s | %10s | %10s | %10s |\n" "Phase" "Calls" "Tokens In" "Tokens Out" "Total"
  printf "| %-32s | %5s | %10s | %10s | %10s |\n" "--------------------------------" "-----" "----------" "----------" "----------"
  echo "$summary" | jq -r '.[] | "\(.phase)\t\(.calls)\t\(.tokens_in)\t\(.tokens_out)\t\(.total)"' | \
    while IFS=$'\t' read -r phase calls tin tout tot; do
      phase_trunc=$(printf "%s" "$phase" | head -c 32)
      printf "| %-32s | %5s | %10s | %10s | %10s |\n" "$phase_trunc" "$calls" "$tin" "$tout" "$tot"
    done
  printf "| %-32s | %5s | %10s | %10s | %10s |\n" "TOTAL" "$total_calls" "$total_in" "$total_out" "$grand"
  echo ""
  echo "Note: Estimates only. For exact usage, integrate Anthropic API usage events (Option 2, separate issue)."
  echo "================================================================"
  echo ""
} >&2

exit 0
