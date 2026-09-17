#!/usr/bin/env bash
# count-r007-r008.sh — retrospective R007/R008 self-count that REUSES the advisor's own
# verdict logic instead of re-implementing it (#1683 찐빠 #2).
#
# WHY: a hand-rolled counting script drifts from the advisor's jq (regex/exclusion tweaks,
# Skill-exemption, spawn-notation dedup, etc.) and produces numbers that don't match what the
# hook itself would have fired — see R020 "자가 계수는 advisor 판정식을 재현한다". This script
# owns ONLY turn-boundary splitting; the actual R007/R008 verdict is always produced by
# INVOKING `.claude/hooks/scripts/r007-r008-drift-advisor.sh`, once per detected turn, so the
# self-count is guaranteed to match the hook 1:1 by construction (not by careful copying).
#
# Turn-boundary definition (R020 「자율 루프 세션의 턴 경계 정의」):
#   1. Pre-filter to JSONL records whose `.message.role` exists (drop meta/event lines).
#   2. Exclude `isSidechain: true` records from boundary/assistant detection entirely — this
#      mirrors the advisor's own `map(select((.isSidechain // false) != true))` filter, applied
#      internally before its turn-boundary logic runs. A sidechain record is never treated as
#      an assistant record or as a boundary, so a sidechain `role=="user"` line cannot create a
#      spurious cutpoint that causes the advisor to be re-invoked on (and double-count) the
#      same preceding orchestrator turn.
#   3. A boundary = a `role == "user"` record whose content is a bare string, OR an array with
#      no `tool_result` block. Tool-result lines are role=="user" but are NOT boundaries — the
#      assistant turn continues across them.
#   4. A "turn" is the run of consecutive (non-sidechain) assistant records between one
#      boundary (exclusive) and the next (exclusive), or end-of-file.
# This is boundary-DETECTION only. It is NOT the advisor's pass/fail logic — that stays
# entirely inside the advisor and is never duplicated here.
#
# Advisor input mechanism used: synthetic hook stdin JSON — `{session_id, hook_event_name:
# "UserPromptSubmit", transcript_path: <prefix file>}`. `transcript_path` wins over the
# advisor's own default path (OMCUSTOM_TRANSCRIPT_BASE is left UNSET here, so it never
# overrides transcript_path — see advisor lines ~204-211). `agent_id` is deliberately OMITTED:
# an absent agent_id keeps the advisor's orchestrator-scope gate open (advisor lines ~158-195);
# setting it would make the advisor silently exit 0 on every turn (#1650 D subagent-session
# gate), producing a false "0 violations" count.
#
# Each turn gets a CUMULATIVE prefix (lines[0 .. end-of-turn]), matching how the advisor sees a
# transcript in production (it always tails the last 200 lines of the file it is given, and the
# file only ever grows) — so per-turn results here are what the hook would actually have fired.
#
# Usage: scripts/count-r007-r008.sh <transcript.jsonl> [--json]
#
# Output (default): human-readable summary.
# Output (--json):  {"turns":N,"r007_missing":N,"r008_missing":N}
#
# macOS zsh-invoked bash: no GNU-only flags; `mktemp -d` uses the BSD-compatible template form.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADVISOR="${REPO_ROOT}/.claude/hooks/scripts/r007-r008-drift-advisor.sh"

usage() {
  echo "Usage: $(basename "$0") <transcript.jsonl> [--json]" >&2
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

TRANSCRIPT="$1"
JSON_OUT=0
if [ "${2:-}" = "--json" ]; then
  JSON_OUT=1
elif [ $# -ge 2 ]; then
  usage
  exit 1
fi

if [ ! -f "$TRANSCRIPT" ]; then
  echo "count-r007-r008: transcript not found: $TRANSCRIPT" >&2
  exit 1
fi
if [ ! -f "$ADVISOR" ]; then
  echo "count-r007-r008: advisor script not found: $ADVISOR" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "count-r007-r008: jq is required" >&2
  exit 1
fi
if ! command -v bash >/dev/null 2>&1; then
  echo "count-r007-r008: bash is required to invoke the advisor" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/count-r007-r008.XXXXXX")"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

CANONICAL="${WORK_DIR}/canonical.jsonl"
META="${WORK_DIR}/meta.tsv"
CUTPOINTS_FILE="${WORK_DIR}/cutpoints.txt"
MARKER_DIR="${WORK_DIR}/markers"
mkdir -p "$MARKER_DIR"

# ── Canonicalize: parse each non-empty line as JSON, drop unparseable lines (matches the
# advisor's own `fromjson? // empty` tolerance) and any non-object JSON value, re-serialize
# compactly one object per line. This is the single source both for prefix slicing (below) AND
# for the boundary-metadata pass — a well-formed JSONL with no raw-text edge cases.
jq -R -c 'fromjson? // empty | select(type == "object")' "$TRANSCRIPT" > "$CANONICAL" 2>/dev/null || true

if [ ! -s "$CANONICAL" ]; then
  echo "count-r007-r008: no parseable JSON records in $TRANSCRIPT" >&2
  exit 1
fi

# ── Turn-boundary metadata: per line index, is it an assistant record, and is it a boundary?
# `isSidechain: true` records are excluded from both checks — mirrors the advisor's
# `(.isSidechain // false) != true` filter (see comment block above). ──
jq -s -r '
  . as $L
  | range(0; ($L | length)) as $i
  | (($L[$i].isSidechain? // false) != true) as $not_sidechain
  | [ $i,
      (if $not_sidechain and ($L[$i].message.role? == "assistant") then 1 else 0 end),
      (if $not_sidechain and ($L[$i].message.role? == "user")
          and ( (($L[$i].message.content? // "" | type) == "string")
                or (([ $L[$i].message.content[]? | select(.type? == "tool_result") ] | length) == 0) )
       then 1 else 0 end)
    ] | @tsv
' "$CANONICAL" > "$META"

TOTAL_LINES=$(wc -l < "$CANONICAL" | tr -d '[:space:]')

# ── Derive cut points: the 0-indexed CANONICAL-line where each turn ENDS. A turn ends either
# right before the next boundary, or at end-of-file for a still-open trailing turn — in both
# cases only when the span since the previous cut contains at least one assistant record (a
# run of consecutive user-boundary lines with nothing in between is not a "turn").
: > "$CUTPOINTS_FILE"
seen_assistant=0
while IFS=$'\t' read -r idx is_assistant is_boundary; do
  if [ "$is_boundary" = "1" ] && [ "$idx" != "0" ] && [ "$seen_assistant" = "1" ]; then
    echo "$((idx - 1))" >> "$CUTPOINTS_FILE"
    seen_assistant=0
  fi
  if [ "$is_assistant" = "1" ]; then
    seen_assistant=1
  fi
done < "$META"
if [ "$seen_assistant" = "1" ]; then
  echo "$((TOTAL_LINES - 1))" >> "$CUTPOINTS_FILE"
fi

turns_scanned=0
r007_missing_total=0
r008_missing_total=0

turn_no=0
while IFS= read -r cutpoint; do
  [ -n "$cutpoint" ] || continue
  turn_no=$((turn_no + 1))
  prefix_file="${WORK_DIR}/prefix_${turn_no}.jsonl"
  head -n "$((cutpoint + 1))" "$CANONICAL" > "$prefix_file"

  stdin_payload=$(
    jq -cn --arg tp "$prefix_file" --arg sid "count-${turn_no}" \
      '{session_id: $sid, hook_event_name: "UserPromptSubmit", transcript_path: $tp}'
  )

  advisor_out=$(
    printf '%s' "$stdin_payload" \
      | OMCUSTOM_R007_MARKER_DIR="$MARKER_DIR" bash "$ADVISOR" 2>/dev/null
  ) || advisor_out=""

  turns_scanned=$((turns_scanned + 1))

  r007_n=0
  r008_n=0
  if [ -n "$advisor_out" ]; then
    ctx=$(printf '%s' "$advisor_out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null) || ctx=""
    # NOTE: the label itself contains digits ("R007"/"R008"), so the count must be extracted
    # anchored to the trailing "건" suffix (e.g. "1건") — a bare `[0-9]+` scan over the whole
    # matched substring would also pick up "007"/"008" from the rule-name label.
    r007_match=$(printf '%s' "$ctx" | grep -oE 'R007 에이전트 식별 헤더 누락 [0-9]+건' || true)
    r008_match=$(printf '%s' "$ctx" | grep -oE 'R008 도구 식별 접두사 누락 [0-9]+건' || true)
    if [ -n "$r007_match" ]; then
      r007_suffixed=$(printf '%s' "$r007_match" | grep -oE '[0-9]+건' || true)
      r007_n="${r007_suffixed%건}"
      : "${r007_n:=0}"
    fi
    if [ -n "$r008_match" ]; then
      r008_suffixed=$(printf '%s' "$r008_match" | grep -oE '[0-9]+건' || true)
      r008_n="${r008_suffixed%건}"
      : "${r008_n:=0}"
    fi
  fi

  r007_missing_total=$((r007_missing_total + r007_n))
  r008_missing_total=$((r008_missing_total + r008_n))
done < "$CUTPOINTS_FILE"

if [ "$JSON_OUT" = "1" ]; then
  jq -cn \
    --argjson turns "$turns_scanned" \
    --argjson r007 "$r007_missing_total" \
    --argjson r008 "$r008_missing_total" \
    '{turns: $turns, r007_missing: $r007, r008_missing: $r008}'
else
  echo "turns scanned:       $turns_scanned"
  echo "R007 header missing: $r007_missing_total"
  echo "R008 prefix missing: $r008_missing_total"
fi
