#!/usr/bin/env bash
# verify-text-edit.sh — one command for the two deterministic checks that every rule/skill/guide
# TEXT-editing delegation carries (#1911 P2):
#   1. the three Korean 합쇼체 checks on ADDED lines (family, line-final auxiliary, noun-ending),
#      each cross-checked by a python3 `re` equivalent on the same input;
#   2. quote-verify: every quotation in a file is searched separately (fixed string) in a target file.
#
# The canonical specification stays in auto-dev.yaml (implement step, "fixed constraint" items
# (a) and (c), the `# BEGIN quote-verify` block). This script is the one-line command for this
# repository; tests/unit/scripts/verify-text-edit.test.ts pins script == yaml. `scripts/` is not
# shipped to consumer projects, so the yaml text remains the fallback where this file is absent.
#
# Usage:
#   verify-text-edit.sh [--stdin | --files <edited-file>...] [--quotes <quotation-file> --target <target-file>]
#   verify-text-edit.sh --help
#
#   --stdin    read the added lines from stdin, as is (nothing is filtered; a leading `+` is harmless)
#   --files    take the added lines of the given files from `git diff HEAD -U0` (tracked files; HEAD
#              against the working tree) or the whole content (untracked files); absolute paths
#              or paths relative to the repository
#              root (derived from this script's own location, not from the caller's cwd)
#   --quotes   file with one quotation per line (no blank line, LF endings); needs --target
#   --target   file the quotations must appear in
#   At least one of --stdin/--files/--quotes is required (--quotes alone = quote-only mode).
#
# Output (stdout): `[korean] added-lines=N`, `[korean] family=N line-final=N noun-ending=N (grep)`,
#   `[korean] family/line-final/noun-ending = N N N (python3)`, and per quotation `<count><TAB><quotation>`.
# Output (stderr): `[korean] FAIL|DISAGREE|WARN ...`, `[quote-verify] HALT|FAIL ...` (byte-identical
#   to the yaml block for the two quote-verify lines).
#
# Exit codes:
#   0  all requested checks passed
#   1  violation: a Korean count > 0, a quotation with count 0, or an empty quotation set (HALT)
#   2  usage error, missing file, python3 missing or failing, or a git/awk command failing while the
#      added lines are collected for --files (no check result)
#   3  grep and python3 disagree on the Korean counts (investigate the cause, do not dismiss it;
#      takes precedence over 1)
#
# Fail-closed policy (#1929 R-1 L-3): every error that would leave the added-line set unknown ends
#   in exit 2 with a message, never in a pass. The one deliberate open path is an EMPTY but
#   successfully collected set (`--stdin` with empty input, `--files` on an unchanged tracked file):
#   it exits 0 with `added-lines=0` and a WARN, because "nothing was added" is a documented valid
#   result (pinned by the 'unchanged tracked file' and 'empty stdin' tests); read the WARN.
#
# Environment: repository-local GIT_* variables (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE, ... as set
#   by git hooks and `git commit -a`) are unset at start, so the git calls below always read
#   $ROOT's own repository (#1929 R-1 L-4).
#
# Locale: measured on macOS (BSD grep 2.6.0-FreeBSD, /bin/bash 3.2) and reported for GNU grep 3.8 in
#   review R0-1: under `LC_ALL=C` or with LANG/LC_* unset, `이다。` counts line-final 1 in python3 and
#   0 in grep (`。` is a byte bracket there), so the exit code is 3; under a UTF-8 locale both
#   give 1. Re-measured on Linux for #1929 F11 (docker, the three grep commands only, 5 fixtures:
#   6 반말 positives, 6 합쇼체 negatives, 4 noun-ending positives, 4 negatives, `이다。`): GNU grep 3.8
#   (Debian 12) and 3.11 (Debian 13) give the same counts as BSD grep under LC_ALL=C.utf8 and under
#   LC_ALL=C (only `이다。` differs under C: line-final 0, as on macOS). ugrep was not available and
#   python3 was absent from the images, so the full script was not run on Linux. Run under a UTF-8 LC_CTYPE.
#
# Interpretations (see the test file for the fixtures):
#   - `--files` drops the diff HEADER lines (`+++ b/<path>`) with a header/hunk state machine, so a
#     path ending in 함/됨/필요/다 is not counted and a content line starting with `++ ` is kept.
#     The yaml (a) command (`git diff -U0 ... | grep '^+'`) keeps the header lines.
#   - `--files` compares tracked files against HEAD (`git diff HEAD -U0`, like the yaml's
#     `git diff HEAD -U0` shell check), i.e. HEAD against the WORKING TREE: an edit that is only
#     staged is still seen; the yaml (a) command uses a plain `git diff -U0` and misses it. A staged
#     version that the working tree later overwrote is NOT checked (re-stage, or check before
#     staging; pinned by the test 'a staged 반말 line overwritten in the working tree', git 2.52.0).
#     In a repository with no commit yet the comparison base is the empty tree
#     (`git hash-object -t tree /dev/null`), so the whole working-tree content counts as added.
#   - `--files` pairs a `git mv`'d file with its source (`git diff -M --name-status`), so only the
#     lines changed beyond the rename count (pinned by the 'git mv' tests, including under
#     `diff.renames=false`, which is what makes the two `-M` flags load-bearing); a plain `mv` is not
#     a rename: the new path is untracked and counts whole. Each pairing is reported as a
#     `[korean] NOTE: ... rename source ...` line on stderr.
#     KNOWN LIMIT (#1929 RR-1 Low-1, reproduced): rename detection picks the most similar deleted
#     file of the WHOLE repository, not the file the author moved. When another deleted file is
#     more similar to the new file than the true source, the new file is compared against that
#     partner: a line of the new file that also exists in the unrelated partner counts as
#     unchanged and is NOT checked (narrow fail-open), while lines inherited from the true source
#     count as added (fail-closed). The script cannot know the author's intent; check the NOTE
#     line for the partner.
#   - `--files` treats an untracked file as fully added (a plain `git diff` shows nothing for it).
#   - `--files` passes the paths as literal pathspecs (`git --literal-pathspecs`): `[xy].md` is a
#     file name, not a glob that also matches `x.md`.
#   - `[korean] added-lines=N` and the `no added lines` warning exist so an empty input is visible.
#
# Portability: bash 3.2 and BSD/GNU userland (POSIX grep flags only, no \s \d \b, no mapfile or
# associative arrays). No `set -e` on purpose: `grep -c` exits 1 on a zero count.

SCRIPT_DIR="$(cd -P "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)" || exit 2
ROOT="$(cd -P "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd -P)" || exit 2

# Drop the repository-local GIT_* variables git itself lists (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE,
# GIT_OBJECT_DIRECTORY, GIT_CONFIG_*, ...): inherited from a hook they would redirect every git
# call below away from $ROOT.
for _v in $(git rev-parse --local-env-vars 2>/dev/null); do
  unset "$_v"
done

usage() {
  cat <<'USAGE'
Usage: verify-text-edit.sh [--stdin | --files <edited-file>...] [--quotes <quotation-file> --target <target-file>]
  --stdin   added lines from stdin, as is
  --files   added lines of the given files (git diff HEAD -U0 = HEAD vs working tree; untracked = whole file)
  --quotes  quotation file, one quotation per line; requires --target
  --target  file the quotations are searched in
Exit: 0 ok | 1 violation / 0-hit or empty quotation set | 2 usage, missing file, or python3 missing or failing (also a failing git/awk step) | 3 grep/python3 disagree
USAGE
}

die_usage() {
  printf 'verify-text-edit: %s\n' "$1" >&2
  usage >&2
  exit 2
}

mode=""
files=()
Q=""
T=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --stdin)
      [ -z "$mode" ] || die_usage "--stdin and --files are mutually exclusive"
      mode=stdin ;;
    --files)
      [ -z "$mode" ] || die_usage "--stdin and --files are mutually exclusive"
      mode=files
      shift
      while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do
        files+=("$1")
        shift
      done
      continue ;;
    --quotes)
      [ -z "$Q" ] || die_usage "--quotes given twice"
      [ $# -ge 2 ] && [ "${2#--}" = "$2" ] || die_usage "--quotes needs a file"
      Q="$2"
      shift ;;
    --target)
      [ -z "$T" ] || die_usage "--target given twice"
      [ $# -ge 2 ] && [ "${2#--}" = "$2" ] || die_usage "--target needs a file"
      T="$2"
      shift ;;
    *) die_usage "unknown argument: $1" ;;
  esac
  shift
done

[ -n "$mode" ] || [ -n "$Q" ] || [ -n "$T" ] || die_usage "nothing to do (give --stdin or --files, and/or --quotes with --target)"
{ [ -n "$Q" ] && [ -n "$T" ]; } || { [ -z "$Q" ] && [ -z "$T" ]; } || die_usage "--quotes and --target go together"
if [ "$mode" = files ] && [ "${#files[@]}" -eq 0 ]; then
  die_usage "--files needs at least one file"
fi
if [ -n "$Q" ]; then
  [ -f "$Q" ] || die_usage "quotation file not found: $Q"
  [ -f "$T" ] || die_usage "target file not found: $T"
fi

rc=0
tmp=""
extra_tmps=()
cleanup() {
  local t
  [ -z "$tmp" ] || command rm -f "$tmp"
  for t in "${extra_tmps[@]}"; do
    command rm -f "$t"
  done
}
# Sets NEWTMP (a function call in $(...) would lose the registration for cleanup).
new_tmp() {
  NEWTMP="$(mktemp "${TMPDIR:-/tmp}/verify-text-edit.XXXXXX")" || return 1
  extra_tmps+=("$NEWTMP")
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

# 1 -> keep an existing non-zero rc (3 beats 1)
mark_violation() {
  [ "$rc" -ne 0 ] || rc=1
}

# Added lines of every given file, header lines removed: `diff `/`@@` switch between header and
# hunk state, only `+` lines inside a hunk are content.
collect_added_from_files() {
  local f abs base
  local tracked=()
  local untracked=()
  # Tracked files are compared against HEAD so a staged-only edit is seen; with no commit yet
  # (HEAD unborn) the empty tree is the base. hash-object gives the empty tree of the repo's own
  # object format (sha1 or sha256).
  base=HEAD
  if ! git --literal-pathspecs -C "$ROOT" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    base="$(git --literal-pathspecs -C "$ROOT" hash-object -t tree /dev/null 2>/dev/null)" || base=""
    [ -n "$base" ] || die_usage "cannot resolve HEAD or the empty tree in $ROOT"
  fi
  for f in "${files[@]}"; do
    case "$f" in
      /*) abs="$f" ;;
      *) abs="$ROOT/$f" ;;
    esac
    if git --literal-pathspecs -C "$ROOT" ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
      tracked+=("$f")
    elif [ -f "$abs" ]; then
      untracked+=("$f")
      printf '[korean] WARN: %s is untracked, its whole content is checked as added\n' "$f" >&2
    else
      die_usage "file not found: $f"
    fi
  done
  # A `git mv`'d file: with only the new path in the pathspec git cannot see the rename and the
  # whole old content would count as added. Add the source path of every rename (-M) whose target
  # is one of the given files. `--relative` and ls-files both give paths relative to $ROOT.
  # Every git/awk step writes to a file and its exit status is checked: a failure (corrupt object,
  # unreadable index, missing awk) must end in exit 2, not in an empty set that reads as a pass.
  local disc raw irc
  if [ "${#tracked[@]}" -gt 0 ]; then
    local given=() name st src dst
    new_tmp || { echo "verify-text-edit: mktemp failed - no check result" >&2; exit 2; }
    disc="$NEWTMP"
    git --literal-pathspecs -C "$ROOT" ls-files -z -- "${tracked[@]}" > "$disc" \
      || { echo "verify-text-edit: git ls-files failed - no check result" >&2; exit 2; }
    while IFS= read -r -d '' name; do
      given+=("$name")
    done < "$disc"
    git --literal-pathspecs -C "$ROOT" diff --no-color --no-ext-diff -M --relative --name-status -z "$base" > "$disc" \
      || { echo "verify-text-edit: git diff (rename discovery) failed - no check result" >&2; exit 2; }
    while IFS= read -r -d '' st && IFS= read -r -d '' src; do
      case "$st" in
        R*|C*) IFS= read -r -d '' dst || break ;;
        *) continue ;;
      esac
      for name in "${given[@]}"; do
        if [ "$name" = "$dst" ]; then
          tracked+=("$src")
          printf '[korean] NOTE: %s is compared against its rename source %s\n' "$dst" "$src" >&2
          break
        fi
      done
    done < "$disc"
  fi
  new_tmp || { echo "verify-text-edit: mktemp failed - no check result" >&2; exit 2; }
  raw="$NEWTMP"
  if [ "${#tracked[@]}" -gt 0 ]; then
    git --literal-pathspecs -C "$ROOT" diff --no-color --no-ext-diff -M -U0 "$base" -- "${tracked[@]}" > "$raw" \
      || { echo "verify-text-edit: git diff failed - no check result" >&2; exit 2; }
  fi
  for f in "${untracked[@]}"; do
    # --no-index implies --exit-code: 1 = differences (expected), >1 = error
    git --literal-pathspecs -C "$ROOT" diff --no-color --no-ext-diff --no-index -U0 -- /dev/null "$f" >> "$raw"
    irc=$?
    [ "$irc" -le 1 ] || { echo "verify-text-edit: git diff --no-index failed for $f (exit $irc) - no check result" >&2; exit 2; }
  done
  awk '/^diff /{h=1; next} /^@@/{h=0; next} h==0 && /^\+/{print}' "$raw" \
    || { echo "verify-text-edit: awk failed - no check result" >&2; exit 2; }
}

if [ -n "$mode" ]; then
  command -v python3 >/dev/null 2>&1 || { echo "verify-text-edit: python3 not found (the python3 cross-check is required)" >&2; exit 2; }
  tmp="$(mktemp "${TMPDIR:-/tmp}/verify-text-edit.XXXXXX")" || exit 2
  if [ "$mode" = files ]; then
    collect_added_from_files > "$tmp"
  else
    command cat > "$tmp"
  fi
  added=$(command grep -c '' < "$tmp")
  printf '[korean] added-lines=%s\n' "$added"
  if [ "$added" -eq 0 ]; then
    echo "[korean] WARN: no added lines were checked" >&2
  fi

  fam=$(command grep -cE '(한다|된다|않는다|따른다|했다|있다|없다|넣는다|이다)[.。 "(]' < "$tmp")
  lf=$(command grep -E '다[.。"]?$' < "$tmp" | command grep -vcE '니다[.。"]?$')
  nn=$(command grep -E '(함|됨|필요)[.。"]?$' < "$tmp" | command grep -c '')

  # Counting unit: grep -c counts matching LINES, so the python3 family check counts matching lines
  # too (re.search per line, split on LF only like grep). len(re.findall(...)) counted every hit and
  # gave DISAGREE (rc 3) whenever one line held two family hits. line-final and noun-ending end in a
  # `$` anchor, so they can match at most once per line and are unaffected.
  IFS= read -r -d '' PY <<'PYEOF'
import re,sys
text=sys.stdin.read()
fam=sum(1 for l in text.split(chr(10)) if re.search(r'(한다|된다|않는다|따른다|했다|있다|없다|넣는다|이다)[.。 "(]', l))
lf=len(re.findall(r'다[.。"]?$', text, re.M)) - len(re.findall(r'니다[.。"]?$', text, re.M))
noun=len(re.findall(r'(함|됨|필요)[.。"]?$', text, re.M))
print(fam, lf, noun)
PYEOF
  py=$(python3 -I -c "$PY" < "$tmp")
  py_rc=$?
  if [ "$py_rc" -ne 0 ] || [ -z "$py" ]; then
    echo "verify-text-edit: python3 failed (exit $py_rc) or printed nothing - no check result" >&2
    exit 2
  fi

  printf '[korean] family=%s line-final=%s noun-ending=%s (grep)\n' "$fam" "$lf" "$nn"
  printf '[korean] family/line-final/noun-ending = %s (python3)\n' "$py"
  if [ "$py" != "$fam $lf $nn" ]; then
    echo "[korean] DISAGREE: grep '$fam $lf $nn' vs python3 '$py' - investigate the cause, do not dismiss" >&2
    rc=3
  fi
  if [ "$fam" != 0 ] || [ "$lf" != 0 ] || [ "$nn" != 0 ]; then
    echo "[korean] FAIL: non-합쇼체 ending(s) in the added lines" >&2
    mark_violation
  fi
fi

if [ -n "$Q" ]; then
  n=0
  miss=0
  while IFS= read -r q || [ -n "$q" ]; do
    [ -n "$q" ] || continue
    n=$((n + 1)); c=$(command grep -cF -e "$q" -- "$T")
    printf '%s\t%s\n' "$c" "$q"
    [ "$c" -gt 0 ] || miss=1
  done < "$Q"
  [ "$n" -gt 0 ] || { echo "[quote-verify] HALT: no quotations to verify" >&2; miss=1; }
  [ "$miss" -eq 0 ] || echo "[quote-verify] FAIL: a quotation has count 0 or none was given" >&2
  [ "$miss" -eq 0 ] || mark_violation
fi

exit "$rc"
