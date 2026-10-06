#!/bin/bash
# cost-cap-advisor.sh — Advisory hook for session cost monitoring
# Trigger: PostToolUse (Edit/Write/Bash/Task/Agent), with continueOnBlock enabled
# Purpose: Warn once per threshold for the current numeric cost cap
# Protocol: stdin JSON -> stdout pass-through; first 100% warning exits 2, otherwise 0

input=$(command cat)

# Cost bridge file written by statusline.sh; both files belong to the caller's PPID.
COST_FILE="/tmp/.claude-cost-${PPID}"
ADVISORY_FILE="/tmp/.claude-cost-advisory-${PPID}"
COST_CAP="${CLAUDE_COST_CAP:-5.00}"

pass_through() {
  printf '%s\n' "$input"
  exit 0
}

# Decimal grammar excludes signs, exponents, whitespace and calculator expressions.
# Normalize strings without floating-point rounding: 005.00 and 5 share identity 5.
normalize_decimal() {
  printf '%s\n' "$1" | LC_ALL=C awk 'END {
    if (NR != 1) exit 1
    value = $0
    if (value !~ /^([0-9]+([.][0-9]*)?|[.][0-9]+)$/) exit 1
    split(value, parts, "[.]")
    whole = parts[1]
    sub(/^0+/, "", whole)
    if (whole == "") whole = "0"
    fraction = parts[2]
    sub(/0+$/, "", fraction)
    if (fraction == "") printf "%s\n", whole
    else printf "%s.%s\n", whole, fraction
  }' 2>/dev/null
}

cap_identity=$(normalize_decimal "$COST_CAP") || pass_through
[ "$cap_identity" != "0" ] || pass_through

# Missing/unreadable/non-regular bridge data cannot mutate the advisory state.
[ -f "$COST_FILE" ] && [ -r "$COST_FILE" ] || pass_through
# TSV: cost_usd, ctx_pct, timestamp, rl_5h_pct, rl_7d_pct, rl_5h_resets, rl_7d_resets
IFS=$'\t' read -r cost_usd ctx_pct timestamp _rl_5h _rl_7d _rl_5h_resets _rl_7d_resets < "$COST_FILE" 2>/dev/null || pass_through
cost_identity=$(normalize_decimal "$cost_usd") || pass_through

# Validate timestamps outside shell arithmetic, including oversized numeric input.
# Preserve the existing policy: skip samples older than 60 seconds.
now=$(date +%s 2>/dev/null) || pass_through
printf '%s\t%s\n' "$timestamp" "$now" | LC_ALL=C awk -F '\t' 'END {
  if (NR != 1 || NF != 2) exit 1
  stamp = $1
  now = $2
  if (stamp !~ /^[0-9]+$/ || now !~ /^[0-9]+$/) exit 1
  if (sprintf("%f", stamp + 0) !~ /^[0-9]+[.][0-9]+$/) exit 1
  if (now - stamp > 60) exit 1
}' 2>/dev/null || pass_through

# bc preserves decimal identity/thresholds without a floating-point cap comparison.
# Remove bc's long-number line wrapping; reject any non-integer result.
cost_pct=$(printf 'scale=0; (%s * 100) / %s\n' "$cost_identity" "$cap_identity" | bc 2>/dev/null) || pass_through
cost_pct=$(printf '%s' "$cost_pct" | tr -d '\\\n')
[[ "$cost_pct" =~ ^[0-9]+$ ]] || pass_through

level=0
# Three or more decimal digits imply >=100; avoid shell integer overflow.
if [ "${#cost_pct}" -ge 3 ]; then
  level=100
elif [ "$cost_pct" -ge 90 ]; then
  level=90
elif [ "$cost_pct" -ge 75 ]; then
  level=75
elif [ "$cost_pct" -ge 50 ]; then
  level=50
fi

last_level=0
state_matches=false
# State is one TSV line: normalized cap, high-water level (0/50/75/90/100).
# A legacy level-only or corrupt state has unknown cap and starts a fresh comparison.
if [ -e "$ADVISORY_FILE" ] || [ -L "$ADVISORY_FILE" ]; then
  [ -f "$ADVISORY_FILE" ] && [ -r "$ADVISORY_FILE" ] && [ ! -L "$ADVISORY_FILE" ] || pass_through
  state=$(command cat "$ADVISORY_FILE" 2>/dev/null) || pass_through
  IFS=$'\t' read -r state_cap state_level state_extra <<< "$state"
  if [ "$state" = "$state_cap"$'\t'"$state_level" ]; then
    case "$state_level" in
      0|50|75|90|100)
        old_cap_identity=$(normalize_decimal "$state_cap") || old_cap_identity=""
        if [ "$old_cap_identity" = "$cap_identity" ]; then
          last_level="$state_level"
          state_matches=true
        fi
        ;;
    esac
  fi
fi

if [ "$state_matches" = true ] && [ "$level" -le "$last_level" ]; then
  pass_through
fi

# Persist cap changes even below 50%, so returning to an earlier cap resets correctly.
# Publish a complete state before warning; failed state I/O stays benign (rc0).
advisory_tmp=$(mktemp "${ADVISORY_FILE}.tmp.XXXXXX" 2>/dev/null) || pass_through
if ! { printf '%s\t%s\n' "$cap_identity" "$level" > "$advisory_tmp" && mv -f "$advisory_tmp" "$ADVISORY_FILE"; } 2>/dev/null; then
  command rm -f "$advisory_tmp" 2>/dev/null
  pass_through
fi

case "$level" in
  100)
    echo "[Cost Cap] Session cost \$${cost_usd} has reached cap \$${COST_CAP} (${cost_pct}%)" >&2
    echo "[Cost Cap] Consider wrapping up or increasing CLAUDE_COST_CAP" >&2
    printf '%s\n' "$input"
    exit 2
    ;;
  90)
    echo "[Cost Cap] Session cost \$${cost_usd} at 90% of cap \$${COST_CAP}" >&2
    echo "[Cost Cap] Ecomode recommended — consider /compact" >&2
    ;;
  75)
    echo "[Cost Cap] Session cost \$${cost_usd} at 75% of cap \$${COST_CAP}" >&2
    ;;
  50)
    echo "[Cost Cap] Session cost \$${cost_usd} at 50% of cap \$${COST_CAP}" >&2
    ;;
esac

pass_through
