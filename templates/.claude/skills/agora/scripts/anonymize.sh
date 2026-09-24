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
# label_permutation <r-list> <vendor_id>... — apply a precomputed Fisher-Yates
# swap sequence and emit A/B/C JSON. <r-list> is a single space-joined string
# of decimal integers, one per swap step, ordered i=n-1..1 (the same order the
# loop below walks) — a STRING, not a bash array: a 1-vendor caller produces
# an EMPTY r-list, and under `set -u` a zero-element bash array is unbound on
# access (bash 3.2 quirk), whereas an empty string has no such trap.
# ---------------------------------------------------------------------------
label_permutation() {
  local r_list="$1"; shift
  local vendors=("$@")
  local n=${#vendors[@]}
  local i j r tmp
  # shellcheck disable=SC2086  # intentional word-split of the r-list string
  set -- $r_list
  for (( i = n - 1; i > 0; i-- )); do
    r="$1"; shift
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
# shuffle_labels <seed> <vendor_id>... — seeded Fisher-Yates, then A/B/C in order.
# ---------------------------------------------------------------------------
shuffle_labels() {
  local seed="$1"; shift
  if [ "$#" -eq 0 ]; then
    printf 'anonymize.sh: shuffle_labels needs at least one vendor\n' >&2
    return 64
  fi

  local n=$#
  local i rs=''
  for (( i = n - 1; i > 0; i-- )); do
    rs+="$(hash_int "$seed" "$i") "
  done

  label_permutation "$rs" "$@"
}

# ---------------------------------------------------------------------------
# hash_hex_stream — batch form of hash_int's hex step: reads "<seed>:<counter>"
# lines on stdin, emits one 8-hex-char digest per line. `shasum` itself is a
# perl script wrapping Digest::SHA (`head -1 "$(which shasum)"` shows the
# shebang `#!/usr/bin/perl` — an ABSOLUTE path), but this function resolves
# `perl` from PATH instead of that fixed interpreter; the two usually
# coincide but are not guaranteed identical. What "no new dependency" means
# precisely: Digest::SHA is already required because shasum needs it, so
# calling perl directly here trades N subprocess forks — one `shasum`
# pipeline per Fisher-Yates swap — for one perl process handling every swap
# of every seed in a `--shuffle-many` batch (spec #1724).
# ---------------------------------------------------------------------------
hash_hex_stream() {
  perl -MDigest::SHA=sha256_hex -lne 'print substr(sha256_hex($_), 0, 8)'
}

# ---------------------------------------------------------------------------
# shuffle_many <count> <vendor_id>... — batch form of calling
# `shuffle_labels "agora-shuffle-$k" <vendor_id>...` for k=1..count and
# concatenating the output, but with ALL hashing for the whole batch done by
# a SINGLE hash_hex_stream invocation instead of one `shasum` pipeline per
# swap per k (#1724 — CI timeout on 600 sequential shuffles). Emits one JSON
# map per line, same as the loop it replaces.
# ---------------------------------------------------------------------------
shuffle_many() {
  local count="$1"; shift

  # Validate count as a non-negative DECIMAL integer, rejecting anything a
  # bare `[ "$count" -ge 1 ]` would either silently accept-as-wrong or blow
  # up on later (measured against the original script, a70f6f47): "abc",
  # "3.0", "0x3" and "1+1" all made `[` itself fail with "integer expression
  # expected" while `shuffle_many` had ALREADY returned rc 0 with no output
  # (the `||` short-circuits `[`'s failure into the same path as count=0);
  # "08" reached the arithmetic `for` below and aborted there instead, with
  # "value too great for base", because bash arithmetic context reads a
  # leading-zero numeral as OCTAL and "8" is not a valid octal digit. Every
  # one of those is a silent-or-confusing failure for a caller that passed a
  # non-integer; reject them all up front with one explicit message instead.
  #
  # Design choices, both intentionally more conservative than the original:
  #   - Negative counts ("-3"): the original returned rc 0 with no output,
  #     identical to a real count of 0 — indistinguishable from "the batch
  #     was empty on purpose". Reject instead so a negative count can never
  #     be mistaken for a legitimate empty result (spec #1724 review M1).
  #   - Leading zeros ("08", "00"): reject rather than normalize (e.g. by
  #     stripping to "8"), because normalization would let two different
  #     caller-supplied strings silently produce the same batch size — an
  #     error is more honest than a silent reinterpretation. "0" itself
  #     (the literal zero, not zero-with-padding) stays valid and unchanged:
  #     rc 0, no output, exactly as before.
  case "$count" in
    0) ;;
    *[!0-9]*|'')
      printf 'anonymize.sh: --shuffle-many count must be a non-negative integer\n' >&2
      return 64
      ;;
    0*)
      printf 'anonymize.sh: --shuffle-many count must be a non-negative integer\n' >&2
      return 64
      ;;
  esac

  [ "$count" -ge 1 ] || return 0

  if [ "$#" -eq 0 ]; then
    # Zero vendors: reuse shuffle_labels for its existing error message and
    # exit code (64) — under `set -e` this aborts the whole script on the
    # first call, exactly as the original per-k loop did on its first
    # iteration, regardless of how large `count` is.
    shuffle_labels "agora-shuffle-1" "$@"
    return
  fi

  local n=$#
  local per_row=$(( n - 1 ))
  local k

  if [ "$per_row" -le 0 ]; then
    # Single-vendor case: no Fisher-Yates swaps needed, so no hashing at all —
    # the same short-circuit label_permutation already takes for an empty
    # r-list, just repeated `count` times.
    for (( k = 1; k <= count; k++ )); do
      label_permutation '' "$@"
    done
    return
  fi

  # Build every "<seed>:<counter>" line for the whole batch up front, in the
  # same nested order (k outer, i=n-1..1 inner) that the per-row consumption
  # loop below expects, then hash them all in one perl process.
  local i lines=''
  for (( k = 1; k <= count; k++ )); do
    for (( i = n - 1; i > 0; i-- )); do
      lines+="agora-shuffle-$k:$i"$'\n'
    done
  done

  local hexes
  hexes=$(printf '%s' "$lines" | hash_hex_stream)

  # hash_hex_stream runs under a pipeline, and `set -euo pipefail` only
  # catches a non-zero EXIT from perl — it says nothing about the perl
  # process emitting fewer lines than it was fed while still exiting 0
  # (e.g. a truncating wrapper ahead of the real perl on PATH). A short
  # stream here is silent data loss: label_permutation would just get
  # called fewer times than `count`, with no error at all. Count the hex
  # lines actually consumed and require BOTH that the total matches
  # count*per_row (spec #1724 review L1) AND that the consume loop below
  # ends with `seen -eq 0` — i.e. the last group closed exactly on a
  # `per_row` boundary rather than being cut off mid-group. The second
  # check is redundant with the first in every case this function can
  # reach (count*per_row is itself a multiple of per_row, so a short total
  # is caught either way), but it is cheap and it directly verifies the
  # invariant the consume loop below depends on, rather than trusting the
  # arithmetic that implies it.
  local hex rs='' seen=0 total=0
  while IFS= read -r hex; do
    rs+="$(( 16#$hex )) "
    seen=$(( seen + 1 ))
    total=$(( total + 1 ))
    if [ "$seen" -eq "$per_row" ]; then
      label_permutation "$rs" "$@"
      rs=''
      seen=0
    fi
  done <<< "$hexes"

  local expected=$(( count * per_row ))
  if [ "$total" -ne "$expected" ] || [ "$seen" -ne 0 ]; then
    printf 'anonymize.sh: --shuffle-many hash stream truncated: got %s hex digest(s), expected %s\n' \
      "$total" "$expected" >&2
    return 70
  fi
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
#
# Every text field is checked with `filled`, not `length > 0`. The byte-count
# form rejected "" but ACCEPTED "   " (measured: a three-space rationale, and
# equally a whitespace-only claim/evidence/impact/counter/id, passed every
# clause here). The spec's requirement is CONTENT, and the gap is not
# cosmetic — a blank-but-present response is counted as a valid reviewer by
# the two-reviewer floor below, so it can be the difference between "round
# aborted, too few reviewers" and a round that reaches the judge, who then
# weighs an opinion that says nothing. The empty string was already rejected;
# a string of spaces says exactly as much.
#
# Applied uniformly across all six text fields rather than to `rationale`
# alone: they are one clause of one contract written in one idiom, and a
# split would leave `counter: "   "` accepted while `counter: ""` is
# rejected — for the field the reviewer prompt singles out as one that
# "cannot be an empty string" (agora.sh's build_reviewer_prompt).
#
# `test("[^[:space:]]")` = "carries at least one non-whitespace character".
# Character-class, not a trim-then-measure, so it costs one pass and covers
# the whitespace this repo's Korean reviewers can actually emit — measured
# to reject U+3000 IDEOGRAPHIC SPACE and U+00A0 NBSP as well as ASCII space,
# tab and newline. The `type == "string"` conjunct stays in front of `test`
# on purpose: jq's `and` short-circuits, so a null/absent/number field is
# reported as a contract violation instead of erroring out of the whole
# filter (which >/dev/null 2>&1 would render indistinguishable from a
# clean rejection).
#
# Rejection is NOT an abort — the caller treats a failing response as a
# missing vendor (see build_bundle), so the two-reviewer floor decides
# whether the round survives.
# ---------------------------------------------------------------------------
validate_response() {
  jq -e '
    def filled: type == "string" and test("[^[:space:]]");
    (type == "object")
    and (.overall | IN("BUILD","BUILD_WITH_CHANGES","REDESIGN","ABANDON"))
    and (.rationale | filled)
    and (.findings | type == "array")
    and (.findings | all(
              (.id       | filled)
          and (.severity | IN("CRITICAL","HIGH","MEDIUM","LOW"))
          and (.claim    | filled)
          and (.evidence | filled)
          and (.impact   | filled)
          and (.counter  | filled)
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
  # two gates fired. 3 is otherwise unused in this script (64/65 are this
  # script's own usage and malformed-data codes — see build_bundle's own arg
  # parsing above for 64, and the integrity-failure return below for 65; 1 is
  # the fingerprint abort). 66/EX_NOINPUT is part of the same skill-wide
  # sysexits-style convention (judge.sh and agora.sh both return it for a
  # missing input file/dir) but this script has no missing-input case of its
  # own to return it from.
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
      shuffle_many "$count" "$@"
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
