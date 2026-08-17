#!/usr/bin/env bash
# reviewers.sh — parallel 3-vendor adapter.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §3 §11
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="$SCRIPT_DIR/response-schema.json"

# Ruling 12 (controller): keep the bare binary names as defaults — `claude`
# and `agy` are the user's shell ALIASES, not distinct binaries, and the
# alias-appended flags below are added explicitly in invoke_vendor() because
# aliases do not expand under non-interactive `bash script.sh` execution.
# omx has no alias (spec §2 measured: /opt/homebrew/bin/omx), so its default
# stays the absolute path.
AGORA_CLAUDE_BIN="${AGORA_CLAUDE_BIN:-claude}"
AGORA_OMX_BIN="${AGORA_OMX_BIN:-/opt/homebrew/bin/omx}"
AGORA_AGY_BIN="${AGORA_AGY_BIN:-agy}"
AGORA_TIMEOUT_SECS="${AGORA_TIMEOUT_SECS:-300}"

# ---------------------------------------------------------------------------
# _child_env_strip — the `env -u NAME` list that removes every AGORA_*
# variable from a vendor CLI's environment.
#
# The anonymity of this process rests on the vendors and the judge never
# reaching the sealed session material. Two guards already covered that:
# agora.sh exports nothing of its own, and no session path is ever passed in
# argv. Neither covers what the OPERATOR's shell exported before agora.sh
# ever ran. Measured: with AGORA_OUTPUT_ROOT set in the invoking shell, that
# value is inherited straight through agora.sh into every vendor CLI spawned
# here, and the whole session tree — sealed round records included — sits one
# glob below it. "We do not pass it" is no defence against a value that is
# already in the environment.
#
# Prefix rule rather than a hardcoded name list, deliberately: a name list
# leaks silently the day someone adds AGORA_SOMETHING_NEW, whereas the prefix
# fails CLOSED — a new variable is stripped unless someone argues it back in.
# Nothing outside the prefix is touched, so PATH, HOME, the vendors' own auth
# tokens and proxy settings all survive; `env -i` would leave the CLIs unable
# to authenticate at all.
#
# Read time and pass time are separate: the config reads above have already
# happened, so this script goes on using AGORA_CLAUDE_BIN, AGORA_TIMEOUT_SECS
# and friends as ordinary shell variables. Only the CHILD's copy is removed,
# which is why test-injected configuration still works.
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

# ---------------------------------------------------------------------------
# run_with_timeout <seconds> <cmd>... — R005: macOS ships no GNU timeout.
# Returns 124 on timeout, otherwise the command's own exit code.
#
# AGORA_FORCE_TIMEOUT_FALLBACK=1 is a TEST-ONLY switch (default off, never
# set in production) that forces the wait-based fallback branch even when
# gtimeout is installed locally, so both the gtimeout path and the fallback
# path can be exercised deterministically regardless of what happens to be
# on the machine running the tests (dev boxes have coreutils; GitHub-hosted
# macos CI runners may not).
#
# F1 (review round 2, controller-measured): the fallback watchdog kills the
# WHOLE PROCESS GROUP of the backgrounded command, not just its direct PID.
# `kill -TERM "$pid"` alone only reaches the direct child — a vendor CLI
# that forks a grandchild (common in Node-wrapped CLIs) orphans it, and the
# orphan keeps running (and, against a real vendor, keeps making API calls)
# after this function has already reported the vendor as timed out/missing.
# Measured: `kill -TERM "$pid"` left 2/3 descendants of a forking stub
# alive; `kill -TERM -- -"$pid"` (negative PID = process group) left 0.
# `gtimeout`'s own default (non `--foreground`) mode already targets the
# whole group, so only this fallback branch needed the fix.
#
# Getting a process group AT ALL requires job control (`set -m`) to be on —
# without it, `"$@" &` inherits this shell's own process group, and a
# negative-PID kill would hit this script's group, not just the timed-out
# command's. macOS ships no `setsid`, so `set -m` is the only portable way
# to get the backgrounded command its own group here. Scoped strictly to
# this function: only turned on if not already on, and turned back off
# before returning, so the rest of reviewers.sh (and any caller) is
# unaffected by the job-control side effects (e.g. "Terminated" job
# notifications on stray fds).
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
  # notification, which (only under `set -m`) prints as a side effect of
  # `wait` reaping a signal-killed background job — noise, not a diagnostic
  # this script itself emits.
  wait "$pid" 2>/dev/null || rc=$?
  # F1 (review round 3, measured): the watchdog must be torn down by PROCESS
  # GROUP for exactly the reason the command itself is — `kill -TERM
  # "$watcher"` reaches only the subshell, and its `sleep` child is orphaned
  # and re-parented to init, where it lingers for the full AGORA_TIMEOUT_SECS
  # (default 300). This is the SUCCESS path: when the command finishes first
  # the watchdog's sleep is still running, so every completed vendor call
  # leaked one. Measured before the fix: 1 orphaned `sleep` per call — up to
  # 6 per round (3 reviewers + 3 judge attempts). On timeout nothing leaked,
  # because the sleep had already elapsed by definition, which is why the
  # existing timeout-path tests never saw it.
  # Safe under `set -m` (guaranteed on in this branch by the block above):
  # measured pgid(watcher) == pid(watcher) != pgid(this script), so the
  # negative-PID kill cannot reach this script's own group. The pid also
  # cannot have been recycled onto an unrelated group, because $watcher is
  # still an unreaped child here — its zombie holds both the pid and the
  # group until the `wait` below.
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
# invoke_vendor <slug> <prompt_file> — dispatches to the vendor-specific CLI
# argument shape (spec §2 REQ-1) and applies run_sanitized uniformly, so
# every vendor is launched under both the timeout and the env strip.
# ---------------------------------------------------------------------------
invoke_vendor() {
  local slug="$1" prompt_file="$2"
  local prompt; prompt=$(cat "$prompt_file")
  case "$slug" in
    claude)
      # --enable-auto-mode: the user's shell `claude` alias appends this
      # flag (Ruling 12 measured); aliases do not expand under
      # non-interactive `bash script.sh` execution, so it must be passed
      # explicitly here or the CLI runs without it.
      run_sanitized "$AGORA_TIMEOUT_SECS" "$AGORA_CLAUDE_BIN" \
        -p --model claude-opus-4-8 --enable-auto-mode "$prompt"
      ;;
    omx)
      # omx is a plain binary, not a shell alias (spec §2 measured) — no
      # extra flag is needed.
      run_sanitized "$AGORA_TIMEOUT_SECS" "$AGORA_OMX_BIN" exec "$prompt"
      ;;
    agy)
      # --dangerously-skip-permissions: the user's shell `agy` alias appends
      # this flag (Ruling 12 measured); aliases do not expand under
      # non-interactive `bash script.sh` execution, so it must be passed
      # explicitly here or the CLI may block on a permission prompt.
      run_sanitized "$AGORA_TIMEOUT_SECS" "$AGORA_AGY_BIN" \
        -p --model gemini-3.1-pro-high --output-format json \
        --json-schema "$SCHEMA_PATH" --dangerously-skip-permissions "$prompt"
      ;;
    *) return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# _emit_vendor_stderr_tail <slug> <err_file> — F2 (review round 2): print the
# last 20 lines of a vendor's captured stderr as part of THIS script's own
# diagnostic output, so a failure's actual cause (auth, rate-limit, model
# deprecation, network) is debuggable instead of silently discarded. A
# vendor's session/hook logs can be long (omx in particular), so only the
# tail is surfaced, not the whole file.
# ---------------------------------------------------------------------------
_emit_vendor_stderr_tail() {
  local slug="$1" err_file="$2"
  if [ -s "$err_file" ]; then
    printf '[agora] %s stderr (last 20 lines):\n' "$slug" >&2
    tail -n 20 "$err_file" >&2
  fi
}

# ---------------------------------------------------------------------------
# call_vendor <slug> <prompt_file> <out_file> — one retry, then missing
# (spec §11). Writes <out_file> ONLY on a verified-parseable success; a
# missing vendor leaves no file at all (silent-failure avoidance: callers
# distinguish "responded" from "missing" by file existence, never by an
# empty/partial file).
#
# F2 (review round 2): each attempt's vendor stderr is captured to
# <out_dir>/<slug>.attempt-<N>.stderr.log — inside SEALED/raw/round-N/, the
# same trust boundary as the raw response itself (never under anon/). On
# success the log is removed (no noise from chatty vendors); on failure it
# is left on disk for audit AND its tail is folded into this script's own
# diagnostic stderr via _emit_vendor_stderr_tail.
# ---------------------------------------------------------------------------
call_vendor() {
  local slug="$1" prompt_file="$2" out_file="$3"
  local attempt rc tmp err_file out_dir_path
  tmp=$(mktemp)
  out_dir_path="$(dirname "$out_file")"

  for attempt in 1 2; do
    rc=0
    err_file="$out_dir_path/$slug.attempt-$attempt.stderr.log"
    invoke_vendor "$slug" "$prompt_file" > "$tmp" 2> "$err_file" || rc=$?

    if [ "$rc" -eq 124 ]; then
      printf '[agora] %s timeout on attempt %s\n' "$slug" "$attempt" >&2
      _emit_vendor_stderr_tail "$slug" "$err_file"
    elif [ "$rc" -ne 0 ]; then
      printf '[agora] %s exited %s on attempt %s\n' "$slug" "$rc" "$attempt" >&2
      _emit_vendor_stderr_tail "$slug" "$err_file"
    elif ! jq -e . "$tmp" >/dev/null 2>&1; then
      printf '[agora] %s returned unparsable output on attempt %s\n' "$slug" "$attempt" >&2
      _emit_vendor_stderr_tail "$slug" "$err_file"
      rc=65
    else
      # Success is written to the final path ONLY after the response has
      # been confirmed valid JSON — never before the check is settled.
      rm -f "$err_file"
      mv "$tmp" "$out_file"
      return 0
    fi

    [ "$attempt" -eq 1 ] && printf '[agora] %s retry\n' "$slug" >&2
  done

  rm -f "$tmp"
  printf '[agora] %s missing after retry\n' "$slug" >&2
  return 1
}

# ---------------------------------------------------------------------------
# run_reviewers --session-dir <dir> --round <N> --prompt-file <file>
# Fans out call_vendor to all three vendors in parallel, then aborts the
# round (exit 3) once two or more are missing (spec §11: a single opinion is
# not a consensus process).
# ---------------------------------------------------------------------------
run_reviewers() {
  local dir='' round='' prompt_file=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir) dir="$2";         shift 2 ;;
      --round)       round="$2";       shift 2 ;;
      --prompt-file) prompt_file="$2"; shift 2 ;;
      *) printf 'reviewers.sh: unknown option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] && [ -n "$prompt_file" ] || {
    printf 'reviewers.sh: --session-dir, --round and --prompt-file are required\n' >&2
    return 64
  }

  local out_dir="$dir/SEALED/raw/round-$round"
  mkdir -p "$out_dir"

  local pids=() slugs=(claude omx agy) slug
  for slug in "${slugs[@]}"; do
    call_vendor "$slug" "$prompt_file" "$out_dir/$slug.json" &
    pids+=("$!")
  done

  local i missing=0
  for i in "${!pids[@]}"; do
    wait "${pids[$i]}" || missing=$(( missing + 1 ))
  done

  if [ "$missing" -ge 2 ]; then
    printf '[agora] 2 or more reviewers missing (%s) — aborting round %s\n' "$missing" "$round" >&2
    return 3
  fi
  printf '[agora] round %s reviewers: %s responded\n' "$round" "$(( 3 - missing ))" >&2
  return 0
}

main() {
  case "${1:---help}" in
    --run) shift; run_reviewers "$@" ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <file>
USAGE
      ;;
    *) printf 'reviewers.sh: unknown option %s\n' "$1" >&2; return 64 ;;
  esac
}

main "$@"
