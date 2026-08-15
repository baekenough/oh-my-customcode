#!/usr/bin/env bash
# anonymize.sh — normalize reviewer responses, shuffle labels, seal the mapping.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §5 §6 §7
set -euo pipefail

# ---------------------------------------------------------------------------
# Vendor identity helpers (spec §7 `map` values are "{cli}:{model}" strings).
# ---------------------------------------------------------------------------
vendor_id() {
  case "$1" in
    claude) printf 'claude:claude-opus-4-8' ;;
    omx)    printf 'omx:default' ;;
    agy)    printf 'agy:gemini-3.1-pro-high' ;;
    *)      printf 'anonymize.sh: unknown vendor slug %s\n' "$1" >&2; return 65 ;;
  esac
}

vendor_slug() {
  case "$1" in
    claude:claude-opus-4-8)     printf 'claude' ;;
    omx:default)                printf 'omx' ;;
    agy:gemini-3.1-pro-high)    printf 'agy' ;;
    *)                          printf 'anonymize.sh: unknown vendor id %s\n' "$1" >&2; return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# hash_int <seed> <counter> — deterministic non-negative integer.
# ---------------------------------------------------------------------------
hash_int() {
  local hex
  hex=$(printf '%s:%s' "$1" "$2" | shasum -a 256 | cut -c1-8)
  printf '%d' "$((16#$hex))"
}

# ---------------------------------------------------------------------------
# shuffle_labels <seed> <vendor_id>... — seeded Fisher-Yates, then A/B/C in order.
# ---------------------------------------------------------------------------
shuffle_labels() {
  local seed="$1"; shift
  if [ "$#" -eq 0 ]; then
    printf 'anonymize.sh: shuffle_labels needs at least one vendor\n' >&2
    return 64
  fi

  local vendors=("$@")
  local n=${#vendors[@]}
  local i j r tmp
  for (( i = n - 1; i > 0; i-- )); do
    r=$(hash_int "$seed" "$i")
    j=$(( r % (i + 1) ))
    tmp="${vendors[$i]}"
    vendors[$i]="${vendors[$j]}"
    vendors[$j]="$tmp"
  done

  local labels=(A B C)
  local out='{'
  for (( i = 0; i < n; i++ )); do
    [ "$i" -gt 0 ] && out+=','
    out+="\"${labels[$i]}\":\"${vendors[$i]}\""
  done
  out+='}'
  printf '%s\n' "$out"
}

main() {
  local mode="${1:---help}"
  case "$mode" in
    --shuffle)
      shift
      local seed="$1"; shift
      shuffle_labels "$seed" "$@"
      ;;
    --shuffle-many)
      shift
      local count="$1"; shift
      local k
      for (( k = 1; k <= count; k++ )); do
        shuffle_labels "agora-shuffle-$k" "$@"
      done
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  anonymize.sh --shuffle <seed> <vendor_id>...
  anonymize.sh --shuffle-many <count> <vendor_id>...
USAGE
      ;;
    *)
      printf 'anonymize.sh: unknown option %s\n' "$mode" >&2
      return 64
      ;;
  esac
}

main "$@"
