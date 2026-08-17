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
# Three tiers, because "vendor name" and "ordinary English word" overlap:
#
#   1. Unambiguous vendor/product tokens — matched as bare SUBSTRINGS, with no
#      word boundary at all: codex, omx, gpt, claude, gemini, antigravity,
#      anthropic, openai (+ the Korean transliterations this repo's reviewers
#      actually write, R000). Substring — not word-bounded — because a trailing
#      boundary lets real identifications through: `(^|[^a-z])claude([^a-z]|$)`
#      does NOT match "claudecode", and `gpt-oss` does not match "chatgpt".
#      None of these appear inside an ordinary English word, so the boundary
#      bought nothing and cost coverage.
#      `agy` KEEPS both boundaries, unchanged: at three letters it is the one
#      token short enough to plausibly land inside an unrelated word (stagy,
#      cagy, a surname), and unlike the others it has no self-identification
#      form to miss — a model does not call itself "agycode".
#
#   2. Model-family names that are ALSO ordinary English words — opus, sonnet,
#      haiku, flash. A bare match would abort on legitimate review prose
#      ("magnum opus", "sonnet-length prose", "flash memory"), so these are
#      matched only in the two shapes that actually identify a model:
#        (a) version-adjacent — "Opus 4.8", "sonnet-5", "flash 2.0"
#        (b) abutting non-ASCII text — "Sonnet 관점에서". This repo reviews in
#            Korean (R000); the English idioms above are ASCII-internal
#            collocations, whereas a bare model word touching Hangul is a
#            self-reference dropped into Korean prose.
#      Accepted false positive: Korean-English mixed technical terms such as
#      "flash 메모리" trip rule (b). Accepted false negative: a bare model word
#      inside English prose with neither a version nor adjacent Hangul
#      ("Sonnet would argue") is regex-indistinguishable from "sonnet-length"
#      and passes. Over-blocking is preferred to under-blocking here — a false
#      positive aborts loudly and recoverably, a miss breaks anonymity silently.
#
#   3. Sealed-path forms (SEALED/, /mapping/, raw/round-) — unchanged.
#
# NOTE: tests/unit/skills/agora-scripts.test.ts parses this literal and feeds it
# to `new RegExp(...)`, so the syntax must stay valid in BOTH POSIX ERE and JS:
# no POSIX bracket classes ([[:space:]]) — plain ranges only.
# ---------------------------------------------------------------------------
AGORA_BANNED_PATTERNS='codex|omx|gpt|claude|gemini|antigravity|anthropic|openai|클로드|제미나이|지피티|앤트로픽|오픈에이아이|(^|[^a-z])agy([^a-z]|$)|(opus|sonnet|haiku|flash)[ ._-]?[0-9]|(opus|sonnet|haiku|flash)[ ._-]*[^ -~]|SEALED/|/mapping/|raw/round-'

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
# relabel_prior <session_dir> <current_round> <prior_round> [map_cur_path] — spec §6.
# vendor = map[M]⁻¹(label_M); label_N = map[N]⁻¹(vendor)
#
# [map_cur_path] overrides where the CURRENT round's mapping is read from; it
# defaults to the sealed on-disk path, but build_bundle passes its staged
# (not-yet-sealed) working copy instead, because relabel_prior runs before the
# fingerprint guard has cleared the current round (spec §12-(1) — see C1).
#
# Exit codes distinguish two failure classes so the caller can react correctly:
#   1 = prior-round data does not exist yet (normal — e.g. round 1 has no round 0)
#   2 = prior-round data EXISTS but failed to parse (integrity problem — the
#       caller must abort loudly rather than silently drop the round).
#       build_bundle surfaces this to ITS caller as 65 (EX_DATAERR), keeping it
#       distinguishable from 1, which build_bundle reserves for the fingerprint
#       abort.
# ---------------------------------------------------------------------------
relabel_prior() {
  local dir="$1" cur="$2" prior="$3" map_cur_path="${4:-$dir/SEALED/mapping/round-$cur.json}"
  local map_prior="$dir/SEALED/mapping/round-$prior.json"
  local bundle_prior="$dir/anon/round-$prior.json"
  local verdict_prior="$dir/verdict/round-$prior.json"

  [ -f "$map_prior" ] && [ -f "$bundle_prior" ] && [ -f "$map_cur_path" ] || return 1

  local mp mc bp
  mp=$(jq -c '.map' "$map_prior" 2>/dev/null) || mp=''
  if [ -z "$mp" ] || [ "$mp" = 'null' ]; then
    printf 'anonymize.sh: INTEGRITY: round-%s mapping is unreadable or malformed (%s)\n' \
      "$prior" "$map_prior" >&2
    return 2
  fi

  mc=$(jq -c '.map' "$map_cur_path" 2>/dev/null) || mc=''
  if [ -z "$mc" ] || [ "$mc" = 'null' ]; then
    printf 'anonymize.sh: INTEGRITY: current-round mapping is unreadable or malformed (%s)\n' \
      "$map_cur_path" >&2
    return 2
  fi

  bp=$(jq -c '.' "$bundle_prior" 2>/dev/null) || bp=''
  if [ -z "$bp" ]; then
    printf 'anonymize.sh: INTEGRITY: round-%s bundle is unreadable or malformed (%s)\n' \
      "$prior" "$bundle_prior" >&2
    return 2
  fi

  local verdict_json='{"verdict":"","draft":""}'
  if [ -f "$verdict_prior" ]; then
    local vd
    vd=$(jq -c '{verdict: (.verdict // ""), draft: (.draft // "")}' "$verdict_prior" 2>/dev/null) || vd=''
    if [ -z "$vd" ]; then
      printf 'anonymize.sh: INTEGRITY: round-%s verdict is unreadable or malformed (%s)\n' \
        "$prior" "$verdict_prior" >&2
      return 2
    fi
    verdict_json="$vd"
  fi

  jq -c -n \
    --argjson mp "$mp" \
    --argjson mc "$mc" \
    --argjson bp "$bp" \
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

  # Spec §11: a single opinion is not a consensus process. reviewers.sh already
  # aborts with exit 3 once two vendors fail to RESPOND, but that gate cannot
  # see the schema check above — a response that arrives and then fails
  # validate_response is counted as missing HERE, after reviewers.sh has passed.
  # Without the same floor on this side, 1 valid + 2 schema-violating responses
  # produce a one-reviewer bundle and the judge ends up ruling "consensus" on a
  # single opinion. Same threshold, same exit code (3) as reviewers.sh, so the
  # caller (agora.sh propagates rc as-is) and the operator-facing meaning
  # "round aborted: too few reviewers" stay identical regardless of which of the
  # two gates fired. 3 is otherwise unused in this script (64/65/66 are usage,
  # malformed-data and missing-input; 1 is the fingerprint abort).
  [ "${#present[@]}" -ge 2 ] || {
    printf 'anonymize.sh: round %s has %s valid reviewer response(s); 2 or more are required (spec §11)\n' \
      "$round" "${#present[@]}" >&2
    return 3
  }

  local map_json
  map_json=$(shuffle_labels "$seed" "${present[@]}")

  # ---------------------------------------------------------------------------
  # Stage everything under $work. Nothing is written to a trust-boundary path
  # (SEALED/mapping/ or anon/) until the fingerprint guard below clears the
  # assembled bundle (spec §12-(1)). Write-then-delete leaves a window where a
  # leaked bundle — or an orphaned sealed mapping with no matching bundle — is
  # a real file at a path Task 4/5 reviewers/judge (or the round loop) can read.
  # ---------------------------------------------------------------------------
  local map_work="$work/mapping.json"
  jq -n --argjson r "$round" --arg s "$seed" --argjson m "$map_json" \
    '{round: $r, seed: $s, map: $m}' > "$map_work"

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

  # prior_rounds[] — the two most recent rounds only (spec §11). The CURRENT
  # round's mapping is read from the staged $map_work, not from SEALED/, since
  # it has not been sealed yet at this point in the pipeline.
  local priors='[]' p
  for p in $(seq $(( round - 2 > 1 ? round - 2 : 1 )) $(( round - 1 ))); do
    [ "$p" -ge 1 ] || continue
    local entry relabel_err="$work/relabel-err-$p.log"
    if entry=$(relabel_prior "$dir" "$round" "$p" "$map_work" 2>"$relabel_err"); then
      priors=$(jq -c --argjson acc "$priors" --argjson e "$entry" -n '$acc + [$e]')
    else
      local rc=$?
      if [ "$rc" -eq 2 ]; then
        # Prior-round files exist but failed to parse: an integrity problem,
        # not an absent round. Fail loud instead of silently dropping the
        # round — the judge must never be blind to a round without a signal.
        # 65 (EX_DATAERR), matching this script's existing use of 65 for
        # malformed vendor data — deliberately NOT 1, which is the fingerprint
        # abort. Both are hard stops, but "the bundle would have leaked a vendor
        # identity" and "the previous round's sealed data is corrupt" demand
        # different operator responses, and collapsing them into one code left
        # the single most security-relevant stop indistinguishable from a
        # data-integrity stop.
        cat "$relabel_err" >&2
        return 65
      fi
      printf 'anonymize.sh: no prior-round data for round %s, skipping\n' "$p" >&2
    fi
  done

  local bundle_work="$work/bundle.json"
  jq -n \
    --argjson r "$round" \
    --arg t "$topic" \
    --argjson att "$attachments" \
    --argjson ag "$agenda" \
    --argjson rv "$reviewers" \
    --argjson pr "$priors" \
    '{round: $r, topic: $t, attachments: $att, agenda: $ag, reviewers: $rv, prior_rounds: $pr}' \
    > "$bundle_work"

  # ---------------------------------------------------------------------------
  # Fingerprint guard scope. Two classes of text reach a LATER round's judge and
  # must therefore be scanned:
  #   - REVIEWER-authored: current-round `.reviewers` and
  #     `.prior_rounds[].reviewers`
  #   - JUDGE-authored: `.prior_rounds[].draft` / `.prior_rounds[].verdict`.
  #     The judge is the anonymization SUBJECT, not an anonymized party (spec
  #     §8) — but relabel_prior carries its draft/verdict INTO the next round's
  #     bundle, where a fresh judge reads it. An attribution the judge wrote
  #     ("A는 Claude 계열로 보인다") would otherwise be handed to its successor
  #     completely unchecked, which is precisely the leak this guard exists to
  #     stop. Being the subject exempts the judge from being anonymized, not
  #     from anonymizing others.
  #
  # OPERATOR-authored text stays out of scope: topic/agenda/attachments are the
  # discussion subject ("should we adopt Gemini" is not a leak). The judge may
  # legitimately quote those — verbatim or in fragments — so before scanning,
  # judge-authored fields are reduced to the words that are NOT part of the
  # operator's own vocabulary. Without that, adding draft/verdict to the scope
  # would abort every round whose topic merely names a vendor.
  #
  # The filter works on whole WORDS (tokenize → drop operator words → rejoin),
  # never on substrings. Substring removal would be an evasion channel in
  # reverse: an innocuous operator word like "mini" would carve "gemini" apart
  # and blind the guard. Word filtering can only ever leave MORE text to scan,
  # so it cannot hide a fingerprint the operator did not already introduce.
  # `/`, `-`, `.` and `_` are word characters here, so path forms stay intact
  # (SEALED/mapping/round-1 must remain one token for the path patterns to fire)
  # and version forms ("Opus 4.8") keep their spacing after the rejoin.
  # Residual (deliberate, errs toward blocking): an operator word carrying a
  # Korean particle in the judge's text ("제미나이는" vs the topic's "제미나이")
  # is a different token, so it is NOT exempted and still aborts.
  #
  # Reviewer text is deliberately NOT filtered: reviewers are anonymized parties
  # and echoing the topic back is already treated as a leak today.
  # ---------------------------------------------------------------------------
  local vendor_derived="$work/vendor-derived.json"
  jq -c --arg t "$topic" --argjson ag "$agenda" --argjson att "$attachments" '
    def toks: [scan("[^ \t\n\r,;:!?()\\[\\]{}\"]+")];
    def scrub($ops):
      [ toks[] | . as $w | select(($ops | index($w | ascii_downcase)) == null) ] | join(" ");
    ( ([$t] + [$ag | .. | strings] + [$att | .. | strings])
      | map(toks) | add | map(ascii_downcase) | unique ) as $ops
    | {
        reviewers,
        prior: [
          .prior_rounds[]?
          | {
              reviewers,
              draft:   ((.draft   // "") | scrub($ops)),
              verdict: ((.verdict // "") | scrub($ops))
            }
        ]
      }
  ' "$bundle_work" > "$vendor_derived"

  # Exit 1 is reserved for THIS abort — the anonymity break (see the prior-round
  # integrity path above, which returns 65 so the caller can tell "the bundle
  # would have leaked" apart from "the prior round's data is corrupt").
  if ! assert_no_fingerprint "$vendor_derived"; then
    return 1
  fi

  mkdir -p "$dir/SEALED/mapping" "$dir/anon"
  mv "$map_work" "$dir/SEALED/mapping/round-$round.json"
  mv "$bundle_work" "$dir/anon/round-$round.json"
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
