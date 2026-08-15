#!/usr/bin/env bash
# agora.sh — entry point, round loop, session state, stop decision.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md
set -euo pipefail

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

main() {
  case "${1:---help}" in
    --decide-stop)
      decide_stop
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  agora.sh --decide-stop            Read state.json on stdin, print the stop code.
USAGE
      ;;
    *)
      printf 'agora.sh: unknown option %s\n' "$1" >&2
      return 64
      ;;
  esac
}

main "$@"
