#!/usr/bin/env bash
# judge.sh — separate-process judge with per-round model rotation.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §3 §8 §11
#
# This script receives ONLY the anonymous bundle path. It accepts no path to
# any other session material, neither as an argument nor through the
# environment — the judge process has no route back to who said what.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERDICT_SCHEMA="$SCRIPT_DIR/verdict-schema.json"

AGORA_CLAUDE_BIN="${AGORA_CLAUDE_BIN:-claude}"
AGORA_AGY_BIN="${AGORA_AGY_BIN:-agy}"
AGORA_TIMEOUT_SECS="${AGORA_TIMEOUT_SECS:-300}"

# spec REQ-3 rotation roster: three slots, disjoint from the reviewer
# roster by model (reviewers.sh uses claude-opus-4-8 and gemini-3.1-pro-high).
JUDGE_ROTATION=(
  'claude:claude-opus-5'
  'agy:claude-opus-4-6-thinking'
  'agy:gpt-oss-120b-medium'
)

# ---------------------------------------------------------------------------
# judge_model_for_round <round> [offset] — R1/R2/R3 fixed, R4+ cycles; an
# offset advances to the next rotation slot (used for judge failover).
# ---------------------------------------------------------------------------
judge_model_for_round() {
  local round="$1" offset="${2:-0}"
  local n=${#JUDGE_ROTATION[@]}
  local idx=$(( (round - 1 + offset) % n ))
  printf '%s\n' "${JUDGE_ROTATION[$idx]}"
}

# ---------------------------------------------------------------------------
# judge_prompt <anon_file> <model_id> — assembles the judge's instructions.
# Only the anonymous bundle's own content is ever embedded here — no path or
# reference to any other session material.
# ---------------------------------------------------------------------------
judge_prompt() {
  local anon_file="$1" model_id="$2"
  cat <<PROMPT
당신은 익명 리뷰 합의 절차의 심판입니다.

입력은 아래 익명 번들 JSON 뿐입니다. 리뷰어는 A/B/C 라벨로만 식별되며,
라벨이 어떤 도구·모델에 대응하는지는 알 수 없고 추측해서도 안 됩니다.
참여 인원은 reviewers 배열의 길이와 같습니다 — 배열에 없는 라벨의 침묵을
유의미한 신호로 해석하지 마십시오.

수행할 일은 세 가지입니다.
1. 리뷰어 의견을 평가하여 consensus 와 verdict 를 판정합니다.
2. 다음 라운드 의제(agenda)를 설정합니다.
3. 재작성된 통합 초안(draft)을 제시합니다.

출력은 아래 JSON 스키마를 정확히 따르는 JSON 객체 하나여야 하며,
"judge" 필드에는 "$model_id" 를 그대로 넣습니다. 다른 텍스트를 덧붙이지 마십시오.

$(cat "$VERDICT_SCHEMA")

--- 익명 번들 ---
$(cat "$anon_file")
PROMPT
}

# ---------------------------------------------------------------------------
# run_with_timeout <seconds> <cmd>... — R005: macOS ships no GNU timeout.
# Kept self-contained here (not shared with reviewers.sh) matching this
# directory's existing convention of scripts that do not import one another.
# Same construction and same measured fix as reviewers.sh's run_with_timeout:
# on timeout, kills the WHOLE PROCESS GROUP of the backgrounded command, not
# just its direct PID — a judge CLI that forks a grandchild is not left
# running after this function reports it as timed out. Getting a process
# group at all requires job control (`set -m`); scoped strictly to this
# function so the rest of the script is unaffected. AGORA_FORCE_TIMEOUT_FALLBACK=1
# is a test-only switch that forces the wait-based fallback branch even when
# gtimeout is installed, so both branches can be exercised deterministically.
# Returns 124 on timeout, otherwise the command's own exit code.
# ---------------------------------------------------------------------------
run_with_timeout() {
  local secs="$1"; shift
  if [ "${AGORA_FORCE_TIMEOUT_FALLBACK:-0}" != "1" ] && command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  local restore_job_control=0
  case $- in
    *m*) ;;
    *) set -m; restore_job_control=1 ;;
  esac

  "$@" &
  local pid=$!
  # Negative PID targets the whole process group (job-control-assigned pgid
  # == the group leader's pid), so grandchildren the command forks are
  # reaped too, not just the direct child.
  ( sleep "$secs"; kill -TERM -- "-$pid" 2>/dev/null ) &
  local watcher=$!

  local rc=0
  # 2>/dev/null: suppresses this shell's own job-control "Terminated"
  # notification, a side effect of `wait` reaping a signal-killed background
  # job under `set -m` — noise, not a diagnostic this script itself emits.
  wait "$pid" 2>/dev/null || rc=$?
  kill -TERM "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true

  [ "$restore_job_control" -eq 1 ] && set +m

  # 143 = SIGTERM from the watchdog; normalize to the GNU timeout convention.
  [ "$rc" -eq 143 ] && rc=124
  return "$rc"
}

# ---------------------------------------------------------------------------
# invoke_judge <model_id> <prompt> — dispatches to the vendor-specific CLI
# argument shape, applying run_with_timeout uniformly. argv carries only the
# prompt string (itself built from nothing but the anonymous bundle) — no
# session path, no material beyond the bundle itself.
# ---------------------------------------------------------------------------
invoke_judge() {
  local model_id="$1" prompt="$2"
  local cli="${model_id%%:*}" model="${model_id#*:}"
  case "$cli" in
    claude)
      run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_CLAUDE_BIN" \
        -p --model "$model" "$prompt"
      ;;
    agy)
      run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_AGY_BIN" \
        -p --model "$model" --output-format json \
        --json-schema "$VERDICT_SCHEMA" "$prompt"
      ;;
    *) return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# _emit_judge_stderr_tail <model_id> <err_file> — mirrors reviewers.sh's
# _emit_vendor_stderr_tail: fold the last lines of a failed judge's own
# stderr into this script's diagnostic output instead of discarding it, so
# the actual cause (auth, rate-limit, model deprecation, timeout) is
# debuggable.
# ---------------------------------------------------------------------------
_emit_judge_stderr_tail() {
  local model_id="$1" err_file="$2"
  if [ -s "$err_file" ]; then
    printf '[agora] judge %s stderr (last 20 lines):\n' "$model_id" >&2
    tail -n 20 "$err_file" >&2
  fi
}

# ---------------------------------------------------------------------------
# validate_verdict <file> — spec §8: `jq -e .` (the caller's syntactic-JSON
# check) only proves the response IS json; it does not prove the response
# HAS the right shape. A response can be syntactically valid and still be
# missing a required field, or carry an enum typo (verdict: "MERGE") that
# would flow straight into Task 1's decide_stop and silently compare false
# forever. The required-field list and enum values are read FROM
# verdict-schema.json itself — never hardcoded here — so this cannot drift
# from the schema file the same way anonymize.sh's fingerprint guard reads
# its own banned-pattern constant directly instead of duplicating it.
# Prints every rejection reason to stderr; returns 0 only when every
# required field is present (and non-null) and every enum value it carries
# is one of the schema's allowed values.
# ---------------------------------------------------------------------------
validate_verdict() {
  local file="$1"
  local reasons=() key val enum_field enum_values r

  while IFS= read -r key; do
    [ -n "$key" ] || continue
    if ! jq -e --arg k "$key" 'has($k) and (.[$k] != null)' "$file" >/dev/null 2>&1; then
      reasons+=("missing required field: $key")
    fi
  done < <(jq -r '.required[]' "$VERDICT_SCHEMA")

  for enum_field in consensus verdict; do
    val=$(jq -r --arg f "$enum_field" '.[$f] // empty' "$file")
    [ -n "$val" ] || continue
    enum_values=$(jq -r --arg f "$enum_field" '.properties[$f].enum[]' "$VERDICT_SCHEMA")
    if ! printf '%s\n' "$enum_values" | grep -qxF -- "$val"; then
      reasons+=("invalid $enum_field: $val")
    fi
  done

  if [ "${#reasons[@]}" -gt 0 ]; then
    for r in "${reasons[@]}"; do
      printf '[agora] verdict schema violation: %s\n' "$r" >&2
    done
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# run_judge --anon-file <path> --out-file <path> --round <N>
# Tries the three rotation slots in order (spec §11 failover). Writes
# <out-file> only after the response is confirmed valid JSON AND schema-valid
# (validate_verdict), then stamps .judge/.round onto it. Each attempt's
# stderr is captured next to the verdict output itself (never any other
# session path) and removed on success; a failing attempt's log is left on
# disk for audit and its tail is folded into this script's own diagnostic
# stderr.
# ---------------------------------------------------------------------------
run_judge() {
  local anon_file='' out_file='' round=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --anon-file) anon_file="$2"; shift 2 ;;
      --out-file)  out_file="$2";  shift 2 ;;
      --round)     round="$2";     shift 2 ;;
      *) printf 'judge.sh: unknown option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$anon_file" ] && [ -n "$out_file" ] && [ -n "$round" ] || {
    printf 'judge.sh: --anon-file, --out-file and --round are required\n' >&2
    return 64
  }
  [ -f "$anon_file" ] || { printf 'judge.sh: %s not found\n' "$anon_file" >&2; return 66; }

  # F1 (review round): fail explicitly and up front if the schema this
  # script validates against cannot even be read/parsed — required-field and
  # enum checks below are read FROM this file, so a silently-missing schema
  # would silently disable validation instead of loudly failing.
  jq -e . "$VERDICT_SCHEMA" >/dev/null 2>&1 || {
    printf 'judge.sh: cannot read or parse verdict schema at %s\n' "$VERDICT_SCHEMA" >&2
    return 68
  }

  local out_dir; out_dir="$(dirname "$out_file")"
  mkdir -p "$out_dir"

  local tmp; tmp=$(mktemp)
  local offset model_id prompt rc err_file
  for offset in 0 1 2; do
    model_id=$(judge_model_for_round "$round" "$offset")
    prompt=$(judge_prompt "$anon_file" "$model_id")
    # F2 (review round): the round is part of the filename so a later round
    # retried in the same out_dir never overwrites an earlier round's audit
    # log — offset alone collided across rounds.
    err_file="$out_dir/.judge-round-$round-attempt-$offset.stderr.log"

    rc=0
    invoke_judge "$model_id" "$prompt" > "$tmp" 2> "$err_file" || rc=$?

    if [ "$rc" -eq 124 ]; then
      printf '[agora] judge %s timed out for round %s\n' "$model_id" "$round" >&2
      _emit_judge_stderr_tail "$model_id" "$err_file"
    elif [ "$rc" -ne 0 ]; then
      printf '[agora] judge %s failed (rc=%s) for round %s\n' "$model_id" "$rc" "$round" >&2
      _emit_judge_stderr_tail "$model_id" "$err_file"
    elif ! jq -e . "$tmp" >/dev/null 2>&1; then
      printf '[agora] judge %s returned unparsable output for round %s\n' "$model_id" "$round" >&2
      _emit_judge_stderr_tail "$model_id" "$err_file"
      rc=65
    elif ! validate_verdict "$tmp"; then
      printf '[agora] judge %s returned a schema-violating verdict for round %s\n' "$model_id" "$round" >&2
      rc=65
    else
      # Success is written to the final path ONLY after the response has
      # been confirmed valid JSON — never before the check is settled.
      rm -f "$err_file"
      jq -c --arg j "$model_id" --argjson r "$round" '.judge = $j | .round = $r' "$tmp" > "$out_file"
      printf '[agora] round %s judged by rotation slot %s (%s)\n' "$round" "$(( offset + 1 ))" "$model_id" >&2
      rm -f "$tmp"
      return 0
    fi

    printf '[agora] advancing judge rotation for round %s\n' "$round" >&2
  done

  rm -f "$tmp"
  printf '[agora] every rotation model failed for round %s\n' "$round" >&2
  return 4
}

main() {
  case "${1:---help}" in
    --model-for-round) shift; judge_model_for_round "$@" ;;
    --run)             shift; run_judge "$@" ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  judge.sh --model-for-round <round> [offset]
  judge.sh --run --anon-file <path> --out-file <path> --round <N>
USAGE
      ;;
    *) printf 'judge.sh: unknown option %s\n' "$1" >&2; return 64 ;;
  esac
}

main "$@"
