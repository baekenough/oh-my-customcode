#!/usr/bin/env bash
# judge.sh — separate-process judge with per-round model rotation.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §3 §8 §11
#
# This script receives ONLY the anonymous bundle path. It accepts no path to
# any other session material, neither as an argument nor through the
# environment — the judge process has no route back to who said what.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# AGORA_VERDICT_SCHEMA points this script at a substitute schema path. Unset —
# which is every non-test invocation — it resolves to the file shipped next to
# this script, byte-for-byte the previous behaviour. Same override convention
# as AGORA_CLAUDE_BIN / AGORA_AGY_BIN / AGORA_TIMEOUT_SECS /
# AGORA_FORCE_TIMEOUT_FALLBACK below: a test that needs to exercise the
# "schema unreadable" path points this at a path that does not exist, instead
# of moving the real tracked file aside and hoping its `finally` runs.
VERDICT_SCHEMA="${AGORA_VERDICT_SCHEMA:-$SCRIPT_DIR/verdict-schema.json}"

AGORA_CLAUDE_BIN="${AGORA_CLAUDE_BIN:-claude}"
AGORA_AGY_BIN="${AGORA_AGY_BIN:-agy}"
AGORA_TIMEOUT_SECS="${AGORA_TIMEOUT_SECS:-300}"

# ---------------------------------------------------------------------------
# _child_env_strip — the `env -u NAME` list that removes every AGORA_*
# variable from the judge CLI's environment.
#
# The header above claims this script accepts no route back to who said what
# "neither as an argument nor through the environment". Argv was guarded; the
# environment was not. What agora.sh does not pass is beside the point — the
# OPERATOR's shell exports reach this process anyway. Measured: with
# AGORA_OUTPUT_ROOT set in the invoking shell, that value is inherited
# straight through into the judge CLI, and the session tree it names holds
# the sealed label-to-vendor record one glob below. That is the whole
# anonymity property, handed over by inheritance.
#
# Prefix rule rather than a hardcoded name list, deliberately: a name list
# leaks silently the day someone adds AGORA_SOMETHING_NEW, whereas the prefix
# fails CLOSED — a new variable is stripped unless someone argues it back in.
# Nothing outside the prefix is touched, so PATH, HOME, the judge CLI's own
# auth tokens and proxy settings all survive; `env -i` would leave it unable
# to authenticate at all.
#
# Read time and pass time are separate: the config reads above have already
# happened, so this script goes on using AGORA_CLAUDE_BIN, AGORA_TIMEOUT_SECS
# and AGORA_VERDICT_SCHEMA as ordinary shell variables. Only the CHILD's copy
# is removed, which is why test-injected configuration still works.
#
# Built from the exported names actually present (compgen -e), so a prefixed
# variable this script has never heard of is covered too.
# ---------------------------------------------------------------------------
_child_env_strip=()
while IFS= read -r _agora_env_name; do
  [ -n "$_agora_env_name" ] || continue
  _child_env_strip+=(-u "$_agora_env_name")
done < <(compgen -e 2>/dev/null | grep '^AGORA_' || true)
unset _agora_env_name

# spec REQ-3 rotation roster: three slots, disjoint from the reviewer
# roster by model (reviewers.sh uses claude-opus-4-8 and gemini-4-neon-high).
JUDGE_ROTATION=(
  'claude:claude-opus-5-5'
  'agy:claude-sonnet-5-5-high'
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
  # Same measured fix as reviewers.sh: tear the watchdog down by PROCESS
  # GROUP, not by bare pid. `kill -TERM "$watcher"` reaches only the subshell
  # and orphans its `sleep`, which then lingers for the full
  # AGORA_TIMEOUT_SECS under init. It leaks on the SUCCESS path (on timeout
  # the sleep has already elapsed by definition), so every judge attempt that
  # returned normally left one behind. Safe under `set -m` (guaranteed on in
  # this branch): measured pgid(watcher) == pid(watcher) != pgid(this
  # script), and $watcher is still unreaped here, so its pid/group cannot
  # have been recycled onto anything else before the `wait` below.
  kill -TERM -- "-$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true

  [ "$restore_job_control" -eq 1 ] && set +m

  # 143 = SIGTERM from the watchdog; normalize to the GNU timeout convention.
  [ "$rc" -eq 143 ] && rc=124
  return "$rc"
}

# ---------------------------------------------------------------------------
# run_sanitized <seconds> <cmd>... — run_with_timeout with the AGORA_*
# variables removed from the command's environment (see _child_env_strip).
# Wrapping the command in `env` rather than unsetting the variables in this
# shell is what keeps the read/pass split above intact. `env` execs the
# command in place, so the pid and process group that run_with_timeout's
# watchdog targets are the command's own, exactly as before.
# ---------------------------------------------------------------------------
run_sanitized() {
  local secs="$1"; shift
  run_with_timeout "$secs" env ${_child_env_strip[@]+"${_child_env_strip[@]}"} "$@"
}

# ---------------------------------------------------------------------------
# invoke_judge <model_id> <prompt> — dispatches to the vendor-specific CLI
# argument shape, applying run_sanitized uniformly so the judge runs under
# both the timeout and the env strip. argv carries only the prompt string
# (itself built from nothing but the anonymous bundle) — no session path, no
# material beyond the bundle itself.
#
# No branch passes a permission-bypass flag, and this is not a
# missed flag: the judge's only legitimate input is the anonymous bundle
# (--anon-file, turned into argv above), and a bypass flag would let the
# judge CLI touch the filesystem without prompting — what this skill's
# sealing exists to deny (the sealed mapping directory holds the
# label-to-vendor record the judge must never read). Not measured for claude;
# false for agy: agy in its headless default mode reads, writes and runs shell
# commands with no flag at all (#1985), so agy slots run only when opted in
# (AGORA_AGY_ENABLE=1, see _agy_enabled). reviewers.sh now passes agy no
# bypass flag either; its claude --enable-auto-mode stays (follow-up #1994).
# Reviewers need no filesystem access: attachments are inlined into their
# prompt (agora.sh build_reviewer_prompt).
#
# Named in prose, never as a path literal, and not by accident: a source
# guard in tests/unit/skills/agora-scripts.test.ts asserts this file
# contains no spelling of that directory at all. The guard is the cheap
# deterministic proof of the paragraph above — code that never names the
# location cannot be assembling a route to it — so describing the
# directory is fine while writing its path is a test failure. Do not
# "clarify" this comment by substituting the concrete path back in.
#
# Operational consequence, so a future session does not "fix" this by
# adding the flag: in an environment where the judge CLI would otherwise
# block on a permission prompt, that attempt times out under
# AGORA_TIMEOUT_SECS (rc=124, handled in run_judge below) and the 3-slot
# rotation (spec REQ-3, judge_model_for_round) advances to the next model;
# exhausting all three slots is exit 4 (run_judge, "every rotation model
# failed"). If the judge keeps failing for this reason, the fix is to check
# the CLI's own permission state (e.g. run it once interactively to grant
# whatever it needs) — never to add the bypass flag here.
# ---------------------------------------------------------------------------
invoke_judge() {
  local model_id="$1" prompt="$2"
  local cli="${model_id%%:*}" model="${model_id#*:}"
  case "$cli" in
    claude)
      run_sanitized "$AGORA_TIMEOUT_SECS" "$AGORA_CLAUDE_BIN" \
        -p --model "$model" "$prompt"
      ;;
    agy)
      # #1985: the prompt is the value of -p (it used to trail a bare -p and
      # agy rejected the argv). Reached only when opted in (run_judge skips
      # agy slots unless _agy_enabled).
      _invoke_agy "$model" "$VERDICT_SCHEMA" "$prompt"
      ;;
    *) return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# agy is OFF by default (#1985). AGORA_AGY_ENABLE=1 (that exact value) opts
# in; any other value or no value leaves it off, and run_judge then skips
# both agy rotation slots, so every round tries the claude slot alone.
#
# Why off: with agy 1.5.15 in its headless default mode, no bypass flag and
# no --mode, the model was observed writing files outside its cwd, reading
# files outside its cwd and running shell commands. Turning agy on hands an
# external model those abilities over material that contains session paths.
# The empty cwd, the OLDPWD/PWD/CLAUDE* env strip and the schema copy below
# only remove passive location hints; none of them is a sandbox.
#
# The switch is read here as an ordinary shell variable. It is AGORA_-
# prefixed, so _child_env_strip removes it from the judge child as well.
# The helpers below are kept self-contained (same code as reviewers.sh),
# matching this directory's convention of scripts that do not import one
# another.
# ---------------------------------------------------------------------------
_agy_enabled() {
  [ "${AGORA_AGY_ENABLE:-}" = "1" ]
}

# ---------------------------------------------------------------------------
# _agy_remove <cwd|schema|out> <path> — delete one per-attempt path, only if
# it still matches the mktemp template it was made from (cwd: agora-agy.*,
# schema: agora-schema.*, out: agora-agyout.*). A mismatch deletes nothing
# and returns 70. `rm -rf -- "$path"` (no trailing slash, no glob) removes a
# symlink in the last path element itself, never what it points at. An empty path is a no-op.
# ---------------------------------------------------------------------------
_agy_remove() {
  local kind="$1" path="$2"
  [ -n "$path" ] || return 0
  case "$kind:$path" in
    cwd:*/agora-agy.*)       rm -rf -- "$path" ;;
    schema:*/agora-schema.*) rm -f -- "$path" ;;
    out:*/agora-agyout.*)    rm -f -- "$path" ;;
    *)
      printf '[agora] agy: per-attempt %s path failed its containment check; not deleting it\n' "$kind" >&2
      return 70
      ;;
  esac
}

# ---------------------------------------------------------------------------
# _agy_mkfile <prefix> — mktemp "${TMPDIR:-/tmp}/<prefix>.XXXXXX" and print
# its absolute (pwd -P) path. rc 70 and no output when the file cannot be
# made, is not a regular file, or the result does not match <prefix>.*.
# ---------------------------------------------------------------------------
_agy_mkfile() {
  local prefix="$1" path='' dir=''
  path=$(mktemp "${TMPDIR:-/tmp}/$prefix.XXXXXX") || return 70
  [ -n "$path" ] && [ -f "$path" ] || return 70
  dir=$(CDPATH= cd -- "$(dirname -- "$path")" && pwd -P) || return 70
  path="$dir/$(basename -- "$path")"
  case "$path" in
    */"$prefix".*) ;;
    *) return 70 ;;
  esac
  printf '%s\n' "$path"
}

# ---------------------------------------------------------------------------
# _invoke_agy <model> <schema> <prompt> — one agy judge attempt. The body is
# a subshell, so the `cd` and every variable stay inside the attempt: run_judge
# calls invoke_judge in the foreground, and a persistent `cd` would break a
# relative --out-file.
#
# Per attempt, all from mktemp under ${TMPDIR:-/tmp}: a fresh empty cwd
# (agora-agy.*), a copy of <schema> (agora-schema.*) used ONLY as the
# --json-schema value (validate_verdict and judge_prompt keep reading the
# original VERDICT_SCHEMA), and a capture file for agy's stdout
# (agora-agyout.*, kept out of the cwd so the cwd is empty when agy starts).
# Failing to make any of them is rc 70 with agy not started; the original
# schema path is never passed instead. The cwd is checked non-empty and a
# directory before any `cd`, absolutized with `pwd -P` (a relative TMPDIR
# would otherwise resolve against the new cwd) and must match */agora-agy.*
# before use.
#
# Child env (agy only): OLDPWD and every name starting with CLAUDE removed,
# PWD set to the temp cwd. A `cd` alone hands the child the caller's
# directory through one of OLDPWD and PWD (measured, bash 3.2.57).
#
# Cleanup runs after every return of run_sanitized (success, failure,
# timeout). agy's rc is saved first and returned unchanged (124 included);
# a cwd or schema-copy cleanup failure (rm error) returns 70, also over 124. Not covered: a
# TERM/INT/HUP/KILL delivered to this script leaves the paths behind
# (deferred, #1994).
#
# On rc 0 the captured stdout must be exactly one top-level JSON object with
# .status == "SUCCESS" and an object .structured_output; that object is
# printed. Anything else is rc 65. `.response` is never parsed.
# ---------------------------------------------------------------------------
_invoke_agy() (
  local model="$1" schema="$2" prompt="$3"
  local cwd='' schema_copy='' out='' name='' body='' rc=0 clean=0
  local child_env=()

  cwd=$(mktemp -d "${TMPDIR:-/tmp}/agora-agy.XXXXXX") || {
    printf '[agora] agy: cannot create the per-attempt working directory; not starting agy\n' >&2
    return 70
  }
  [ -n "$cwd" ] && [ -d "$cwd" ] || {
    printf '[agora] agy: cannot create the per-attempt working directory; not starting agy\n' >&2
    return 70
  }
  cwd=$(CDPATH= cd -- "${cwd:?}" && pwd -P) || {
    printf '[agora] agy: cannot resolve the per-attempt working directory; not starting agy\n' >&2
    return 70
  }
  case "$cwd" in
    */agora-agy.*) ;;
    *)
      printf '[agora] agy: per-attempt working directory failed its containment check; not starting agy\n' >&2
      return 70
      ;;
  esac

  schema_copy=$(_agy_mkfile agora-schema) && cp -- "$schema" "$schema_copy" || {
    printf '[agora] agy: cannot create the per-attempt --json-schema copy; not starting agy (the original schema path is never passed instead)\n' >&2
    _agy_remove schema "$schema_copy" || true
    _agy_remove cwd "$cwd" || true
    return 70
  }
  out=$(_agy_mkfile agora-agyout) || {
    printf '[agora] agy: cannot create the per-attempt output capture file; not starting agy\n' >&2
    _agy_remove schema "$schema_copy" || true
    _agy_remove cwd "$cwd" || true
    return 70
  }

  child_env=(-u OLDPWD)
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    child_env+=(-u "$name")
  done < <(compgen -e 2>/dev/null | grep '^CLAUDE' || true)
  child_env+=("PWD=$cwd")

  if cd -- "$cwd"; then
    run_sanitized "$AGORA_TIMEOUT_SECS" "${child_env[@]}" "$AGORA_AGY_BIN" \
      --model "$model" --output-format json --json-schema "$schema_copy" \
      -p "$prompt" > "$out" || rc=$?
    cd / || true
  else
    rc=70
  fi

  _agy_remove cwd "$cwd" || clean=70
  _agy_remove schema "$schema_copy" || clean=70
  if [ "$clean" -ne 0 ] || [ "$rc" -ne 0 ]; then
    _agy_remove out "$out" || true
    [ "$clean" -ne 0 ] && return "$clean"
    return "$rc"
  fi

  body=$(jq -c -s '
    if length == 1
       and (.[0] | type) == "object"
       and .[0].status == "SUCCESS"
       and (.[0].structured_output | type) == "object"
    then .[0].structured_output
    else empty end' "$out" 2>/dev/null) || body=''
  _agy_remove out "$out" || return 70
  [ -n "$body" ] || {
    printf '[agora] agy: output is not exactly one JSON object with status "SUCCESS" and an object structured_output\n' >&2
    return 65
  }
  printf '%s\n' "$body"
)

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
# forever. The required-field list, the declared TYPES and the enum values
# are all read FROM verdict-schema.json itself — never hardcoded here — so
# this cannot drift from the schema file the same way anonymize.sh's
# fingerprint guard reads its own banned-pattern constant directly instead
# of duplicating it.
#
# F1 (review round 3, measured): presence + enums alone let a WRONG-TYPED
# field through. A judge returning `"agenda": "1. 단일 의제"` (string where
# the schema declares an array) passed every check here and was written to
# verdict/round-N.json. agora.sh's run_round then reads it back next round
# and runs `jq '. + $extra'`, which dies with `string and array cannot be
# added`; the rc is discarded by the `agenda=$(...)` assignment, so agenda
# collapses to empty, build_reviewer_prompt renders a BLANK agenda section,
# and all three vendors are invoked and billed before anonymize.sh's later
# `--agenda ''` finally surfaces the problem. That is precisely the failure
# agora.sh's own --extra-agenda pre-check exists to prevent — but that guard
# only covers USER input into that slot, and the judge's own output lands in
# the same slot with no equivalent guard. This closes it at the source.
#
# Prints every rejection reason to stderr; returns 0 only when every
# required field is present (and non-null), every field's value matches the
# type the schema declares for it, and every enum value it carries is one of
# the schema's allowed values.
# ---------------------------------------------------------------------------
validate_verdict() {
  local file="$1"
  local reasons=() key val want got enum_field enum_values r

  while IFS= read -r key; do
    [ -n "$key" ] || continue
    if ! jq -e --arg k "$key" 'has($k) and (.[$k] != null)' "$file" >/dev/null 2>&1; then
      reasons+=("missing required field: $key")
    fi
  done < <(jq -r '.required[]' "$VERDICT_SCHEMA")

  # Type check, driven entirely by the schema's own .properties[].type.
  # jq's `type` yields exactly the JSON Schema primitive names (object,
  # array, string, number, boolean, null), so the comparison is direct.
  # Absent and null values are skipped here: every property in this schema
  # is also in .required, so the loop above already reports them, and
  # reporting the same defect twice would only add noise. Properties whose
  # `type` is not a plain string (e.g. a ["string","null"] union) are
  # skipped rather than guessed at, so a future schema edit degrades to
  # "not type-checked" instead of to a false rejection.
  while IFS=$'\t' read -r key want; do
    [ -n "$key" ] && [ -n "$want" ] || continue
    got=$(jq -r --arg k "$key" 'if has($k) then (.[$k] | type) else "absent" end' "$file" 2>/dev/null)
    case "$got" in absent | null) continue ;; esac
    if [ "$got" != "$want" ]; then
      reasons+=("field $key: expected $want, got $got")
    fi
  done < <(jq -r '
    .properties | to_entries[]
    | select(.value.type | type == "string")
    | "\(.key)\t\(.value.type)"' "$VERDICT_SCHEMA")

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
  if _agy_enabled; then
    printf '[agora] WARNING: agy judge slots enabled (AGORA_AGY_ENABLE=1) for round %s: agy can write, read and run shell commands outside its empty per-attempt cwd; the empty cwd and env strip are not a sandbox\n' "$round" >&2
  fi
  for offset in 0 1 2; do
    model_id=$(judge_model_for_round "$round" "$offset")
    # Off by default (_agy_enabled): an agy slot is skipped without being
    # started, so the claude slot is the only one tried.
    if [ "${model_id%%:*}" = agy ] && ! _agy_enabled; then
      printf '[agora] judge %s skipped for round %s: agy disabled by default (opt in with AGORA_AGY_ENABLE=1)\n' "$model_id" "$round" >&2
      continue
    fi
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
