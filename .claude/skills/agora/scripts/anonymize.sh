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

# ---------------------------------------------------------------------------
# Fingerprint guard (spec §12-(1)). Case-insensitive; a hit aborts the session.
# ---------------------------------------------------------------------------
AGORA_BANNED_PATTERNS='codex|omx|(^|[^a-z])agy([^a-z]|$)|gemini|claude -p|antigravity|gpt-oss|claude[- ]opus|claude[- ]sonnet|claude-|SEALED/|/mapping/|raw/round-'

assert_no_fingerprint() {
  local file="$1"
  if LC_ALL=C command grep -Eiq "$AGORA_BANNED_PATTERNS" "$file"; then
    printf 'AGORA_FINGERPRINT_DETECTED: %s\n' "$file" >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# validate_response <file> — spec §5 contract. Exit 0 when the contract holds.
# ---------------------------------------------------------------------------
validate_response() {
  jq -e '
    (type == "object")
    and (.overall | IN("BUILD","BUILD_WITH_CHANGES","REDESIGN","ABANDON"))
    and (.rationale | type == "string" and (length > 0))
    and (.findings | type == "array")
    and (.findings | all(
              (.id       | type == "string" and (length > 0))
          and (.severity | IN("CRITICAL","HIGH","MEDIUM","LOW"))
          and (.claim    | type == "string" and (length > 0))
          and (.evidence | type == "string" and (length > 0))
          and (.impact   | type == "string" and (length > 0))
          and (.counter  | type == "string" and (length > 0))
          and (.verdict  | IN("KEEP","MODIFY","REJECT"))
        ))
  ' "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# normalize_response <file> — keep only the spec §5 whitelist (REQ-7).
# ---------------------------------------------------------------------------
normalize_response() {
  jq -c '{
    findings: [ .findings[] | {id, severity, claim, evidence, impact, counter, verdict} ],
    overall: .overall,
    rationale: .rationale
  }' "$1"
}

# ---------------------------------------------------------------------------
# relabel_prior <session_dir> <current_round> <prior_round> — spec §6.
# vendor = map[M]⁻¹(label_M); label_N = map[N]⁻¹(vendor)
# ---------------------------------------------------------------------------
relabel_prior() {
  local dir="$1" cur="$2" prior="$3"
  local map_prior="$dir/SEALED/mapping/round-$prior.json"
  local map_cur="$dir/SEALED/mapping/round-$cur.json"
  local bundle_prior="$dir/anon/round-$prior.json"
  local verdict_prior="$dir/verdict/round-$prior.json"

  [ -f "$map_prior" ] && [ -f "$map_cur" ] && [ -f "$bundle_prior" ] || return 1

  local verdict_json='{"verdict":"","draft":""}'
  if [ -f "$verdict_prior" ]; then
    verdict_json=$(jq -c '{verdict: (.verdict // ""), draft: (.draft // "")}' "$verdict_prior")
  fi

  jq -c -n \
    --argjson mp "$(jq -c '.map' "$map_prior")" \
    --argjson mc "$(jq -c '.map' "$map_cur")" \
    --argjson bp "$(jq -c '.' "$bundle_prior")" \
    --argjson vd "$verdict_json" \
    --argjson rn "$prior" '
      ($mc | to_entries | map({key: .value, value: .key}) | from_entries) as $curByVendor
      | {
          round: $rn,
          reviewers: [
            $bp.reviewers[]
            | ($mp[.label]) as $vendor
            | select($vendor != null and $curByVendor[$vendor] != null)
            | { label: $curByVendor[$vendor], overall: .overall, rationale: .rationale }
          ] | sort_by(.label),
          verdict: $vd.verdict,
          draft: $vd.draft
        }
    '
}

# ---------------------------------------------------------------------------
# build_bundle — normalize → shuffle → label → seal mapping → emit anon bundle.
# ---------------------------------------------------------------------------
build_bundle() {
  local dir='' round='' seed='' topic='' attachments='[]' agenda='[]'
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir)  dir="$2";         shift 2 ;;
      --round)        round="$2";       shift 2 ;;
      --seed)         seed="$2";        shift 2 ;;
      --topic)        topic="$2";       shift 2 ;;
      --attachments)  attachments="$2"; shift 2 ;;
      --agenda)       agenda="$2";      shift 2 ;;
      *) printf 'anonymize.sh: unknown build option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] && [ -n "$seed" ] || {
    printf 'anonymize.sh: --session-dir, --round and --seed are required\n' >&2
    return 64
  }

  local raw_dir="$dir/SEALED/raw/round-$round"
  local work; work=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" RETURN

  local present=()
  local slug id
  for slug in claude omx agy; do
    local raw="$raw_dir/$slug.json"
    [ -f "$raw" ] || continue
    validate_response "$raw" || {
      printf 'anonymize.sh: %s failed the schema contract, treating as missing\n' "$slug" >&2
      continue
    }
    id=$(vendor_id "$slug")
    normalize_response "$raw" > "$work/$slug.json"
    present+=("$id")
  done

  [ "${#present[@]}" -gt 0 ] || {
    printf 'anonymize.sh: no valid reviewer response for round %s\n' "$round" >&2
    return 66
  }

  local map_json
  map_json=$(shuffle_labels "$seed" "${present[@]}")

  mkdir -p "$dir/SEALED/mapping" "$dir/anon"
  jq -n --argjson r "$round" --arg s "$seed" --argjson m "$map_json" \
    '{round: $r, seed: $s, map: $m}' > "$dir/SEALED/mapping/round-$round.json"

  # reviewers[] — always sorted by label (spec §6).
  local reviewers='[]'
  local label
  for label in A B C; do
    id=$(printf '%s' "$map_json" | jq -r --arg l "$label" '.[$l] // empty')
    [ -n "$id" ] || continue
    slug=$(vendor_slug "$id")
    reviewers=$(jq -c --arg l "$label" --slurpfile body "$work/$slug.json" --argjson acc "$reviewers" \
      -n '$acc + [{label: $l, findings: $body[0].findings, overall: $body[0].overall, rationale: $body[0].rationale}]')
  done

  # prior_rounds[] — the two most recent rounds only (spec §11).
  local priors='[]' p
  for p in $(seq $(( round - 2 > 1 ? round - 2 : 1 )) $(( round - 1 ))); do
    [ "$p" -ge 1 ] || continue
    local entry
    if entry=$(relabel_prior "$dir" "$round" "$p" 2>/dev/null); then
      priors=$(jq -c --argjson acc "$priors" --argjson e "$entry" -n '$acc + [$e]')
    fi
  done

  local out="$dir/anon/round-$round.json"
  jq -n \
    --argjson r "$round" \
    --arg t "$topic" \
    --argjson att "$attachments" \
    --argjson ag "$agenda" \
    --argjson rv "$reviewers" \
    --argjson pr "$priors" \
    '{round: $r, topic: $t, attachments: $att, agenda: $ag, reviewers: $rv, prior_rounds: $pr}' \
    > "$out"

  if ! assert_no_fingerprint "$out"; then
    rm -f "$out"
    return 1
  fi
  return 0
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
    --build)
      shift
      build_bundle "$@"
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  anonymize.sh --shuffle <seed> <vendor_id>...
  anonymize.sh --shuffle-many <count> <vendor_id>...
  anonymize.sh --build --session-dir <dir> --round <N> --seed <seed> \
    --topic <str> --attachments <json-array> --agenda <json-array>
USAGE
      ;;
    *)
      printf 'anonymize.sh: unknown option %s\n' "$mode" >&2
      return 64
      ;;
  esac
}

main "$@"
