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
# run_with_timeout <seconds> <cmd>... — R005: macOS ships no GNU timeout.
# Returns 124 on timeout, otherwise the command's own exit code.
#
# AGORA_FORCE_TIMEOUT_FALLBACK=1 is a TEST-ONLY switch (default off, never
# set in production) that forces the wait-based fallback branch even when
# gtimeout is installed locally, so both the gtimeout path and the fallback
# path can be exercised deterministically regardless of what happens to be
# on the machine running the tests (dev boxes have coreutils; GitHub-hosted
# macos CI runners may not).
# ---------------------------------------------------------------------------
run_with_timeout() {
  local secs="$1"; shift
  if [ "${AGORA_FORCE_TIMEOUT_FALLBACK:-0}" != "1" ] && command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null ) &
  local watcher=$!

  local rc=0
  wait "$pid" || rc=$?
  kill -TERM "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true

  # 143 = SIGTERM from the watchdog; normalize to the GNU timeout convention.
  [ "$rc" -eq 143 ] && rc=124
  return "$rc"
}

# ---------------------------------------------------------------------------
# invoke_vendor <slug> <prompt_file> — dispatches to the vendor-specific CLI
# argument shape (spec §2 REQ-1) and applies run_with_timeout uniformly.
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
      run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_CLAUDE_BIN" \
        -p --model claude-opus-4-8 --enable-auto-mode "$prompt"
      ;;
    omx)
      # omx is a plain binary, not a shell alias (spec §2 measured) — no
      # extra flag is needed.
      run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_OMX_BIN" exec "$prompt"
      ;;
    agy)
      # --dangerously-skip-permissions: the user's shell `agy` alias appends
      # this flag (Ruling 12 measured); aliases do not expand under
      # non-interactive `bash script.sh` execution, so it must be passed
      # explicitly here or the CLI may block on a permission prompt.
      run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_AGY_BIN" \
        -p --model gemini-3.1-pro-high --output-format json \
        --json-schema "$SCHEMA_PATH" --dangerously-skip-permissions "$prompt"
      ;;
    *) return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# call_vendor <slug> <prompt_file> <out_file> — one retry, then missing
# (spec §11). Writes <out_file> ONLY on a verified-parseable success; a
# missing vendor leaves no file at all (silent-failure avoidance: callers
# distinguish "responded" from "missing" by file existence, never by an
# empty/partial file).
# ---------------------------------------------------------------------------
call_vendor() {
  local slug="$1" prompt_file="$2" out_file="$3"
  local attempt rc tmp
  tmp=$(mktemp)

  for attempt in 1 2; do
    rc=0
    invoke_vendor "$slug" "$prompt_file" > "$tmp" 2>/dev/null || rc=$?

    if [ "$rc" -eq 124 ]; then
      printf '[agora] %s timeout on attempt %s\n' "$slug" "$attempt" >&2
    elif [ "$rc" -ne 0 ]; then
      printf '[agora] %s exited %s on attempt %s\n' "$slug" "$rc" "$attempt" >&2
    elif ! jq -e . "$tmp" >/dev/null 2>&1; then
      printf '[agora] %s returned unparsable output on attempt %s\n' "$slug" "$attempt" >&2
      rc=65
    else
      # Success is written to the final path ONLY after the response has
      # been confirmed valid JSON — never before the check is settled.
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
