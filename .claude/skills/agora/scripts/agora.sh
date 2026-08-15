#!/usr/bin/env bash
# agora.sh — entry point, round loop, session state, stop decision.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md
#
# -e is intentionally NOT set: run_round's exit code (including reviewers.sh
# /anonymize.sh/judge.sh propagated failures) must be explicitly captured and
# returned by its callers (start_session's loop, main()'s --round dispatch),
# not silently abort the whole interpreter mid-function on the first failing
# command substitution inside run_round/init_session/generate_report.
set -uo pipefail

# ---------------------------------------------------------------------------
# decide_stop — PURE function (spec §9).
# Reads a state.json document on stdin, writes exactly one of
# CONSENSUS | STALLED | MAX_ROUNDS | USER | CONTINUE on stdout.
# Touches neither the filesystem nor the network so bun test can call it directly.
# ---------------------------------------------------------------------------
decide_stop() {
  jq -r '
    def last_round: (.history | length) as $n | if $n == 0 then null else .history[$n - 1] end;
    def quiet($i):
      ($i > 0)
      and (.history[$i].new_findings == 0)
      and (.history[$i].max_severity == .history[$i - 1].max_severity);

    (.history | length) as $n
    | if (.stop == "USER") then "USER"
      elif ($n > 0
            and (last_round.consensus == "UNANIMOUS")
            and (last_round.verdict == "BUILD" or last_round.verdict == "BUILD_WITH_CHANGES"))
        then "CONSENSUS"
      elif ($n >= 3 and quiet($n - 1) and quiet($n - 2)) then "STALLED"
      elif ($n > 0 and (.round >= .max_rounds)) then "MAX_ROUNDS"
      else "CONTINUE"
      end
  '
}
# --- end decide_stop ---

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEWERS_SH="$SCRIPT_DIR/reviewers.sh"
ANONYMIZE_SH="$SCRIPT_DIR/anonymize.sh"
JUDGE_SH="$SCRIPT_DIR/judge.sh"

AGORA_OUTPUT_ROOT="${AGORA_OUTPUT_ROOT:-.claude/outputs/sessions}"

topic_slug() {
  printf '%s' "$1" | tr -cs '[:alnum:]' '-' | cut -c1-32 | sed 's/-*$//'
}

# ---------------------------------------------------------------------------
# resolve_abs_dir <dir> — normalizes a session directory to an ABSOLUTE path.
# The Produces contract requires --start's stdout to carry the session dir's
# absolute path; AGORA_OUTPUT_ROOT defaults to a RELATIVE path
# (.claude/outputs/sessions), and agora-runner (Task 8, spec §12) may invoke
# --round/--gate/--report from a different cwd than the one --start ran in —
# a relative path threaded through would silently resolve against the wrong
# cwd there. Every entry point that receives or produces a session dir
# normalizes it here rather than trusting the caller to have already done so.
# ---------------------------------------------------------------------------
resolve_abs_dir() {
  local dir="$1"
  ( cd "$dir" 2>/dev/null && pwd ) || {
    printf 'agora.sh: session dir not found: %s\n' "$dir" >&2
    return 66
  }
}

# ---------------------------------------------------------------------------
# init_session <topic> <max_rounds> <mode> — creates the session artifact
# tree (spec §4) and the initial state.json, prints the session dir on
# stdout. Env overrides: AGORA_SESSION_EPOCH (determinism for tests/audit),
# AGORA_OUTPUT_ROOT (artifact root, default .claude/outputs/sessions per R006).
# ---------------------------------------------------------------------------
init_session() {
  local topic="$1" max_rounds="$2" mode="$3"
  local epoch="${AGORA_SESSION_EPOCH:-$(date +%s)}"
  local day; day=$(date -u +%Y-%m-%d)
  local hms; hms=$(date -u +%H%M%S)
  local dir="$AGORA_OUTPUT_ROOT/$day/agora-$(topic_slug "$topic")-$hms"

  mkdir -p "$dir/SEALED/raw" "$dir/SEALED/mapping" "$dir/anon" "$dir/verdict"
  dir=$(resolve_abs_dir "$dir") || return 66
  jq -n --argjson mr "$max_rounds" --arg m "$mode" --arg t "$topic" --arg e "$epoch" \
    '{round: 0, max_rounds: $mr, mode: $m, topic: $t, epoch: $e, attachments: [], history: [], stop: null}' \
    > "$dir/state.json"
  printf '%s' "$dir"
}

# ---------------------------------------------------------------------------
# build_reviewer_prompt <session_dir> <round> <out_file> [agenda_json] —
# spec §10: R1 is a blank-slate independent review (topic + attachments
# only, no agenda, no prior_rounds, no draft); R2+ injects the previous
# round's agenda, draft and an anonymized summary of the previous round's
# opinions.
#
# agenda_json is the CALLER's already-combined agenda (judge agenda + any
# --extra-agenda from the gate's `e` option, spec §10) — this function does
# NOT re-derive it from verdict/round-N.json itself, so there is exactly one
# place (run_round) that decides what "this round's agenda" means; a second
# independent derivation here would drift the moment --extra-agenda exists.
# ---------------------------------------------------------------------------
build_reviewer_prompt() {
  local dir="$1" round="$2" out="$3" agenda_json="${4:-[]}"
  local topic; topic=$(jq -r '.topic' "$dir/state.json")
  local attachments; attachments=$(jq -r '.attachments[]?' "$dir/state.json")

  {
    printf '당신은 익명 상호검증 리뷰어입니다.\n\n'
    printf '주제: %s\n\n' "$topic"
    if [ -n "$attachments" ]; then
      printf '첨부 문서:\n'
      printf '%s\n' "$attachments" | while IFS= read -r a; do
        printf -- '--- %s ---\n' "$a"
        [ -f "$a" ] && cat "$a"
      done
      printf '\n'
    fi
    # spec §10: round 1 is the only genuinely independent review — no frame injected.
    if [ "$round" -gt 1 ]; then
      local prev=$(( round - 1 ))
      printf '직전 라운드 의제:\n'
      jq -r '.[]? | "  - " + .' <<< "$agenda_json"
      printf '\n직전 라운드 통합 초안:\n%s\n\n' "$(jq -r '.draft // ""' "$dir/verdict/round-$prev.json")"
      printf '직전 라운드 익명 의견 요약:\n%s\n\n' "$(jq -c '.reviewers | map({label, overall})' "$dir/anon/round-$prev.json")"
    fi
    printf '아래 JSON 스키마를 정확히 따르는 JSON 객체 하나만 출력하십시오.\n'
    printf '"counter" 는 자기 주장에 대한 반론이며 빈 문자열이 될 수 없습니다.\n\n'
    cat "$SCRIPT_DIR/response-schema.json"
  } > "$out"
}

# ---------------------------------------------------------------------------
# run_round --session-dir <dir> --round <N> [--extra-agenda <json-array>] —
# the agora-runner delegation unit (spec §12: "라운드 1개 = 위임 1건"). Drives
# reviewers.sh → anonymize.sh → judge.sh for exactly one round, then updates
# state.json.
#
# judge.sh's exit 68 is a CONFIGURATION error (its own verdict-schema.json is
# unreadable) — NOT a vendor/CLI failure like exit 4 (every rotation model
# failed). It is consumed here as an immediate hard stop with its own
# diagnostic line and is never retried: retrying would fail identically all
# three times (the schema file does not become readable by trying again) and
# would only burn wall-clock. Every other non-zero code from
# reviewers.sh/anonymize.sh/judge.sh is propagated as-is.
#
# No path here is ever exported — reviewers.sh/anonymize.sh/judge.sh receive
# every path they need as an explicit CLI flag, never via inherited
# environment, so judge.sh's "no route back to who said what" claim (spec §4)
# is not undermined by this loop leaking a sealed-path env var to it.
#
# --extra-agenda is the gate's `e` option (spec §10): user agenda items are
# APPENDED after the judge's own agenda, never overwriting it — the judge's
# REQ-6 agenda-setting authority must survive a user append. Concatenation
# happens ONCE here and the combined array is threaded into BOTH the
# reviewer prompt (build_reviewer_prompt) and anonymize.sh's --agenda (which
# becomes what the judge itself reads next round) — a single source of truth
# for "this round's agenda", not two independent re-derivations that could
# drift from each other.
# ---------------------------------------------------------------------------
run_round() {
  local dir='' round='' extra_agenda='[]'
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir)  dir="$2";           shift 2 ;;
      --round)        round="$2";         shift 2 ;;
      --extra-agenda) extra_agenda="$2";  shift 2 ;;
      *) printf 'agora.sh: unknown round option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] || { printf 'agora.sh: --session-dir and --round required\n' >&2; return 64; }
  dir=$(resolve_abs_dir "$dir") || return 66

  local round_start; round_start=$(date +%s)

  local epoch; epoch=$(jq -r '.epoch' "$dir/state.json")
  local topic; topic=$(jq -r '.topic' "$dir/state.json")
  local attachments; attachments=$(jq -c '.attachments' "$dir/state.json")
  local agenda='[]'
  if [ "$round" -gt 1 ]; then
    agenda=$(jq -c '.agenda // []' "$dir/verdict/round-$(( round - 1 )).json")
  fi
  agenda=$(jq -c --argjson extra "$extra_agenda" '. + $extra' <<< "$agenda")

  local prompt_file="$dir/SEALED/raw/round-$round.prompt.txt"
  mkdir -p "$dir/SEALED/raw/round-$round"
  build_reviewer_prompt "$dir" "$round" "$prompt_file" "$agenda"

  bash "$REVIEWERS_SH" --run --session-dir "$dir" --round "$round" --prompt-file "$prompt_file" || return $?

  bash "$ANONYMIZE_SH" --build \
    --session-dir "$dir" --round "$round" --seed "agora-$epoch-r$round" \
    --topic "$topic" --attachments "$attachments" --agenda "$agenda" || return $?

  bash "$JUDGE_SH" --run \
    --anon-file "$dir/anon/round-$round.json" \
    --out-file "$dir/verdict/round-$round.json" \
    --round "$round"
  local judge_rc=$?
  if [ "$judge_rc" -eq 68 ]; then
    printf '[agora] judge.sh reported a configuration error (verdict schema unreadable) for round %s — aborting, not retrying\n' \
      "$round" >&2
    return 68
  elif [ "$judge_rc" -ne 0 ]; then
    return "$judge_rc"
  fi

  local round_end; round_end=$(date +%s)
  local elapsed=$(( round_end - round_start ))

  local v="$dir/verdict/round-$round.json"
  local max_sev
  max_sev=$(jq -r '
    ([.unresolved[]?.severity] | map({CRITICAL:4, HIGH:3, MEDIUM:2, LOW:1}[.] // 0) | max // 0) as $m
    | if $m == 4 then "CRITICAL" elif $m == 3 then "HIGH"
      elif $m == 2 then "MEDIUM" elif $m == 1 then "LOW" else "NONE" end' "$v")

  local tmp; tmp=$(mktemp)
  jq --argjson r "$round" \
     --arg verdict "$(jq -r '.verdict' "$v")" \
     --arg consensus "$(jq -r '.consensus' "$v")" \
     --argjson nf "$(jq -r '.new_findings' "$v")" \
     --arg sev "$max_sev" \
     --argjson elapsed "$elapsed" \
     '.round = $r
      | .history += [{round: $r, verdict: $verdict, consensus: $consensus,
                      new_findings: $nf, max_severity: $sev, tokens: 0, elapsed_secs: $elapsed}]' \
     "$dir/state.json" > "$tmp" && mv "$tmp" "$dir/state.json" && chmod 644 "$dir/state.json"
  return 0
}

# ---------------------------------------------------------------------------
# gate_display <session_dir> <round> — spec §10 gate block. Labels only,
# vendors are never named here (they surface for the first time in
# report.md — spec §4's single anonymity-lifting point). Also surfaces the
# round's wall-clock duration: judge rotation alone is a worst case of
# ~15 minutes (3 slots x AGORA_TIMEOUT_SECS default 300s), on top of the
# reviewer fan-out, so the user should not be left blind to how long a round
# actually took even though this script does not enforce a round-level
# timeout policy of its own.
# ---------------------------------------------------------------------------
gate_display() {
  local dir="$1" round="$2"
  dir=$(resolve_abs_dir "$dir") || return 66
  local v="$dir/verdict/round-$round.json"
  local a="$dir/anon/round-$round.json"
  local max_rounds; max_rounds=$(jq -r '.max_rounds' "$dir/state.json")
  local elapsed
  elapsed=$(jq -r --argjson r "$round" '.history[] | select(.round == $r) | (.elapsed_secs // 0)' "$dir/state.json")

  printf -- '─── Agora Round %s/%s ───────────────────────────────\n' "$round" "$max_rounds"
  printf '심판:      (모델 로테이션 #%s)\n' "$(( (round - 1) % 3 + 1 ))"
  printf 'Consensus: %-16s Verdict: %s\n' "$(jq -r '.consensus' "$v")" "$(jq -r '.verdict' "$v")"
  printf '리뷰어:    %s\n' "$(jq -r '[.reviewers[] | .label + " " + .overall] | join(" · ")' "$a")"
  printf '신규 지적: %s건               최고 심각도: %s\n' \
    "$(jq -r '.new_findings' "$v")" \
    "$(jq -r --argjson r "$round" '.history[] | select(.round == $r) | .max_severity' "$dir/state.json")"
  printf '라운드 소요: %s초 (참고: 심판 로테이션 3슬롯 순차 재시도 시 최악 약 15분)\n' "$elapsed"
  printf '\n해소됨(%s)\n' "$(jq -r '.resolved | length' "$v")"
  jq -r '.resolved[]? | "  " + .id + "  " + .resolution' "$v"
  printf '\n미해소(%s)\n' "$(jq -r '.unresolved | length' "$v")"
  jq -r '.unresolved[]? | "  " + .id + "  [" + .severity + "] " + .positions' "$v"
  printf '\n다음 라운드 의제\n'
  jq -r '.agenda[]? | "  - " + .' "$v"
  printf '\n[c] 계속  [s] 중단하고 보고서  [e] 의제 추가 후 계속\n'
}

# ---------------------------------------------------------------------------
# generate_report <session_dir> — spec §4: the ONE place anonymity is
# lifted. Reads SEALED/mapping/round-N.json (never read by any other
# function in this script apart from report generation). Staged to a temp
# file and moved into place only once fully assembled, so a mid-write
# failure never leaves a partial report.md at the final path.
# ---------------------------------------------------------------------------
generate_report() {
  local dir="$1"
  dir=$(resolve_abs_dir "$dir") || return 66
  local out="$dir/report.md"
  local stop; stop=$(jq -r '.stop // "UNKNOWN"' "$dir/state.json")
  local last; last=$(jq -r '.round' "$dir/state.json")

  local tmp; tmp=$(mktemp)
  {
    printf '# Agora 합의 보고서\n\n'
    printf -- '- 주제: %s\n' "$(jq -r '.topic' "$dir/state.json")"
    printf -- '- 종료 사유: %s\n' "$stop"
    printf -- '- 총 라운드: %s\n\n' "$last"
    if [ "$stop" = "MAX_ROUNDS" ]; then
      printf '> **합의 없음 · 분기 결정 필요** — 상한 도달로 종료되었습니다.\n\n'
    elif [ "$stop" = "STALLED" ]; then
      printf '> **정체로 조기 종료** — 잔존 쟁점을 그대로 보고하며 결론을 강제하지 않습니다.\n\n'
    fi

    printf '## 최종 통합 초안\n\n%s\n\n' "$(jq -r '.draft // ""' "$dir/verdict/round-$last.json")"

    printf '## 라운드별 참여자 (익명 해제)\n\n'
    local n
    for (( n = 1; n <= last; n++ )); do
      printf '### 라운드 %s\n\n' "$n"
      jq -r '.map | to_entries[] | "- " + .key + " → " + .value' "$dir/SEALED/mapping/round-$n.json"
      printf '\n'
    done

    printf '## 잔존 쟁점\n\n'
    jq -r '.unresolved[]? | "- " + .id + " [" + .severity + "] " + .positions' "$dir/verdict/round-$last.json"
    printf '\n'
  } > "$tmp"
  mv "$tmp" "$out" && chmod 644 "$out"
}

# ---------------------------------------------------------------------------
# start_session <topic> [--attach <path>]... [--max-rounds <N>] [--auto]
# Creates the session, then drives the round loop:
#   - mode auto:  runs rounds until decide_stop() says stop, then reports.
#   - mode gated: runs exactly ONE round, prints the gate, and returns — the
#     orchestrator drives subsequent rounds via `--round <N> --session-dir`.
# ---------------------------------------------------------------------------
start_session() {
  local topic='' max_rounds=5 mode='gated'
  local attachments=()
  topic="$1"; shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --attach)      attachments+=("$2"); shift 2 ;;
      --max-rounds)  max_rounds="$2";     shift 2 ;;
      --auto)        mode='auto';         shift ;;
      *) printf 'agora.sh: unknown start option %s\n' "$1" >&2; return 64 ;;
    esac
  done

  local dir; dir=$(init_session "$topic" "$max_rounds" "$mode")
  if [ "${#attachments[@]}" -gt 0 ]; then
    local att_json; att_json=$(printf '%s\n' "${attachments[@]}" | jq -R . | jq -sc .)
    local tmp; tmp=$(mktemp)
    jq --argjson a "$att_json" '.attachments = $a' "$dir/state.json" > "$tmp" \
      && mv "$tmp" "$dir/state.json" && chmod 644 "$dir/state.json"
  fi

  local round=1 stop='CONTINUE' rc
  while [ "$round" -le "$max_rounds" ]; do
    rc=0
    run_round --session-dir "$dir" --round "$round" || rc=$?
    [ "$rc" -eq 0 ] || return "$rc"

    stop=$(decide_stop < "$dir/state.json")
    if [ "$stop" != "CONTINUE" ]; then
      local tmp; tmp=$(mktemp)
      jq --arg s "$stop" '.stop = $s' "$dir/state.json" > "$tmp" \
        && mv "$tmp" "$dir/state.json" && chmod 644 "$dir/state.json"
      break
    fi

    # In gated mode the orchestrator drives the gate; the script yields after one round.
    if [ "$mode" = 'gated' ]; then
      gate_display "$dir" "$round"
      printf '%s\n' "$dir"
      return 0
    fi
    round=$(( round + 1 ))
  done

  generate_report "$dir"
  printf '%s\n' "$dir"
  return 0
}

main() {
  case "${1:---help}" in
    --decide-stop)
      decide_stop
      ;;
    --start)
      shift
      start_session "$@"
      ;;
    --round)
      # CLI syntax is documented (Produces contract) as
      # `agora.sh --round <N> --session-dir <dir>`: the round number is the
      # very next token after --round, not a `--round <N>` flag pair at this
      # level. Reconstruct it into the --round/--session-dir flag pair
      # run_round's own parser expects, in either order the caller supplied
      # the remaining flags.
      shift
      local round_n="${1:-}"; shift || true
      run_round --round "$round_n" "$@"
      ;;
    --gate)
      shift
      local gd='' gr=''
      while [ "$#" -gt 0 ]; do
        case "$1" in
          --session-dir) gd="$2"; shift 2 ;;
          --round)       gr="$2"; shift 2 ;;
          *) printf 'agora.sh: unknown gate option %s\n' "$1" >&2; return 64 ;;
        esac
      done
      [ -n "$gd" ] && [ -n "$gr" ] || {
        printf 'agora.sh: --gate requires --session-dir and --round\n' >&2
        return 64
      }
      gate_display "$gd" "$gr"
      ;;
    --report)
      shift
      local rd=''
      while [ "$#" -gt 0 ]; do
        case "$1" in
          --session-dir) rd="$2"; shift 2 ;;
          *) printf 'agora.sh: unknown report option %s\n' "$1" >&2; return 64 ;;
        esac
      done
      [ -n "$rd" ] || { printf 'agora.sh: --report requires --session-dir\n' >&2; return 64; }
      generate_report "$rd"
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  agora.sh --decide-stop                              Read state.json on stdin, print the stop code.
  agora.sh --start "<topic>" [--attach <path>]... [--max-rounds <N>] [--auto]
                                                        Create a session and drive the round loop.
  agora.sh --round <N> --session-dir <dir> [--extra-agenda <json-array>]
                                                        Run exactly one round (agora-runner delegation unit).
                                                        --extra-agenda is the gate's `e` option (spec §10):
                                                        it is APPENDED after the judge's own agenda, never
                                                        overwriting it.
  agora.sh --gate --session-dir <dir> --round <N>      Render the label-only gate block for a round.
  agora.sh --report --session-dir <dir>                Regenerate report.md from the sealed mapping.

Gated-mode contract (spec §12, "라운드 1개 = 위임 1건"):
  --start WITHOUT --auto runs exactly ROUND 1 and returns — it does not loop
  further. Every round after that is driven by the CALLER (agora-runner /
  the orchestrator), one round per delegation:
    1. bash agora.sh --round <N> --session-dir <dir>    Advance one round.
    2. bash agora.sh --decide-stop < state.json         Check the stop code yourself.
    3. bash agora.sh --gate --session-dir <dir> --round <N>
                                                         Show the round's gate (skip if you already stopped).
    4. bash agora.sh --report --session-dir <dir>       Generate report.md once you decide to stop.
  --round on its own NEVER calls decide_stop, NEVER writes .stop, NEVER
  renders a gate, and NEVER generates report.md — those four steps are the
  caller's responsibility in gated mode. (--start --auto performs all of
  this internally and needs none of the above.)
USAGE
      ;;
    *)
      printf 'agora.sh: unknown option %s\n' "$1" >&2
      return 64
      ;;
  esac
}

main "$@"
