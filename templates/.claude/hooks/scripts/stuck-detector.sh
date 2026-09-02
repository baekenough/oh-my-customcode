#!/bin/bash
set -euo pipefail
HOOK_START=$(date +%s%N 2>/dev/null || echo 0)

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Stuck Detector Hook
# Trigger: PostToolUse, tool matches "Edit|Write|Bash|Task|Agent"
# Purpose: Detect repetitive failure loops and advise recovery
# Protocol: stdin JSON -> process -> stdout pass-through
#   - exit 0: advisory (normal cases, < HARD_BLOCK_THRESHOLD repetitions)
#   - exit 2: hard block (extreme stuck loops, >= HARD_BLOCK_THRESHOLD repetitions)

# Hard block threshold: consecutive identical operations before blocking
HARD_BLOCK_THRESHOLD=${CLAUDE_STUCK_THRESHOLD:-3}

# Determine if a Bash command is read-only (metadata/query only, no side effects).
# Conservative: any ambiguity (redirection, substitution, "||", or an
# unrecognized command/subcommand) is treated as NOT read-only (write).
# Compound commands chained with "&&", ";", or a single "|" are split into
# segments (#1629) — the whole command is read-only ONLY when EVERY segment
# is read-only; one write segment (or one unparseable/empty segment) makes
# the whole command a write.
# Used to exclude read-only Bash polling from Hard Block Checks 1 and 3
# (same-path / same-tool+target consecutive-repeat blocking) AND the Signal 3
# tool-spam advisory below — Signal 1 (repeated-error advisory) and Hard
# Block Check 2 (same error hash) are intentionally unaffected: repeated
# errors are a genuine stuck signal regardless of read/write (issue #1625).

# Classify a SINGLE (non-compound) command segment as read-only. Callers
# (is_readonly_bash_command) are responsible for stripping ambiguous
# constructs and splitting compound commands before invoking this directly.
is_readonly_single_command() {
  local cmd="$1"
  if [ -z "$cmd" ]; then
    echo "false"
    return 0
  fi

  # A NEWLINE is a statement separator, so this function — which classifies a
  # SINGLE statement — must never see one: "read -ra" below stops at the first
  # newline, so "git status\nrm -rf build" used to be judged on "git status"
  # alone and came back read-only (#1647 M-5). Callers split on newlines
  # (Step 6); anything still multi-line here is ambiguous => write.
  case "$cmd" in
    *$'\n'*)
      echo "false"
      return 0
      ;;
  esac

  local parts=()
  read -ra parts <<< "$cmd"
  local w1="${parts[0]:-}"
  local w2="${parts[1]:-}"
  local w3="${parts[2]:-}"

  # Variable assignment prefix: "VAR=value" or "VAR=value cmd args".
  # A bare assignment has no side effect outside the shell; when followed by a
  # command, classify that command instead. Command substitutions inside the
  # RHS were already validated and replaced by is_readonly_bash_command (#1641).
  #
  # EXCEPTION (#1647 L-1): a few variables change WHICH program runs, or how it
  # is loaded, so the trailing command's NAME no longer describes what the
  # command does — "LD_PRELOAD=./evil.so ls" is not "ls", and "PATH=/tmp ls"
  # runs an arbitrary /tmp/ls. Assignments to those names are writes whether or
  # not a command follows them; an ordinary "FOO=1 ls" still defers to "ls".
  #
  # The git entry is the GLOB "GIT_*", not the three names GIT_DIR /
  # GIT_WORK_TREE / GIT_INDEX_FILE it replaced: git has many more variables
  # that run an arbitrary program (GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_EDITOR,
  # GIT_SSH, GIT_*_COMMAND, ...) or relocate the repository, and enumerating
  # them one at a time keeps losing that race. GLOBIGNORE (changes which files
  # a glob expands to) and BASH_XTRACEFD (sends trace output to an arbitrary
  # descriptor, i.e. a file) are writes for the same reason.
  case "$w1" in
    [A-Za-z_]*=*)
      case "${w1%%=*}" in
        PATH|LD_*|DYLD_*|BASH_ENV|ENV|IFS|PROMPT_COMMAND|SHELLOPTS|BASHOPTS|GLOBIGNORE|BASH_XTRACEFD|GIT_*)
          echo "false"
          return 0
          ;;
      esac
      if [ "${#parts[@]}" -le 1 ]; then
        echo "true"
        return 0
      fi
      local rest_cmd="${cmd#*"$w1"}"
      rest_cmd="$(printf '%s' "$rest_cmd" | sed -e 's/^[[:space:]]*//')"
      is_readonly_single_command "$rest_cmd"
      return 0
      ;;
  esac

  case "$w1" in
    ls|cat|head|tail|grep|rg|wc|jq|md5|md5sum|type|which|echo|printf|pwd|date)
      echo "true"
      return 0
      ;;
    command)
      # "command" used to sit in the whitelist above, which made
      # "command rm -rf x" read-only (#1647 L-5) — it is a PREFIX around an
      # arbitrary program, not a program. Only the lookup forms ("command -v",
      # "command -V") are read-only. "builtin" and "exec" are deliberately
      # absent from the whitelist for the same reason: they fall through to the
      # "*)" write default below.
      case "$w2" in
        -v|-V)
          echo "true"
          ;;
        *)
          echo "false"
          ;;
      esac
      return 0
      ;;
    find)
      # Writing actions (#1647 L-5): -delete/-exec/-execdir remove or run
      # things, -ok/-okdir are the interactive forms of -exec, and
      # -fprint/-fprint0/-fprintf/-fls all CREATE a file. Each pattern is
      # wrapped in "*" on BOTH sides, so it matches the fragment ANYWHERE in
      # the command, not just as an option prefix: that is how the "dir"/"0"/
      # "f" variants ("-execdir", "-fprint0", "-okdir") are covered by a single
      # entry, and it also means an operand that merely CONTAINS the fragment
      # (e.g. "find . -name '*-exec*'") is classified as a write. That
      # over-match is the safe direction — a write verdict only ever tightens
      # blocking.
      case "$cmd" in
        *-delete*|*-exec*|*-fprint*|*-fls*|*-ok*)
          echo "false"
          ;;
        *)
          echo "true"
          ;;
      esac
      return 0
      ;;
    git)
      case "$w2" in
        status|log|diff|show|rev-parse|ls-files)
          echo "true"
          ;;
        tag|branch)
          # Only a bare query (no positional args, flags only) counts as read-only.
          # e.g. "git branch -a" / "git tag --sort=..." => read; "git branch foo"
          # or "git branch -D foo" => write (has a non-flag token).
          local ok="true"
          local i
          for ((i = 2; i < ${#parts[@]}; i++)); do
            case "${parts[$i]}" in
              -*) ;;
              *) ok="false" ;;
            esac
          done
          printf '%s\n' "$ok"
          ;;
        *)
          # fetch and all other subcommands (checkout/merge/rebase/push/...) => write
          echo "false"
          ;;
      esac
      return 0
      ;;
    gh)
      if [ "$w2" = "api" ]; then
        # GET-style only; any field/method-mutation flag => write
        case "$cmd" in
          *' -f '*|*' -F '*|*'--raw-field'*|*'--input'*|*' -X '*|*'--method'*)
            echo "false"
            ;;
          *)
            echo "true"
            ;;
        esac
      else
        case "$w3" in
          view|list)
            echo "true"
            ;;
          *)
            echo "false"
            ;;
        esac
      fi
      return 0
      ;;
    *)
      echo "false"
      return 0
      ;;
  esac
}

# Remove heredoc BODIES ("<<DELIM", "<<-'DELIM'") from a command, keeping the
# header line. A heredoc body is DATA, not statements: without this, the
# newline splitting in Step 6 (#1647 M-5) would classify every data line as a
# command and turn "cat <<'EOF' ... EOF" — read-only before #1647 — into a
# write. Herestrings ("<<<") are single-line and are NOT heredocs. An
# UNTERMINATED heredoc is unparseable, so a sentinel word is emitted instead
# and the caller classifies the command as a write. The same sentinel route is
# taken when the "<<" turns out to sit INSIDE a quoted string (see below).
_strip_heredoc_bodies() {
  local text="$1"
  local out="" line tok delim="" in_body=0
  local before_op dq sq
  while IFS= read -r line; do
    if [ "$in_body" -eq 1 ]; then
      # "<<-" allows leading tabs before the terminator; accept leading
      # whitespace for either form.
      tok="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [ "$tok" = "$delim" ]; then
        in_body=0
      fi
      continue
    fi
    out="${out}${line}"$'\n'
    # A DELIMITER FORGERY guard: the extraction below has no idea whether the
    # "<<" it finds is shell syntax or literal text inside a quoted string, so
    # `echo "a << EOF"` followed by `rm -rf x` and a line reading `EOF` used to
    # hand the rm to the heredoc BODY — where it was dropped as data — and the
    # command came back read-only. Quote state is not tracked here, so rather
    # than guess, count the quotes preceding the "<<": an ODD number of " or '
    # means the "<<" is quoted, the command is unparseable by this function,
    # and the sentinel makes the CALLER classify the whole multi-line command
    # as a write. "${line%<<*}" strips the shortest matching suffix, i.e. it
    # yields the text before the LAST "<<" — the same occurrence the greedy
    # extraction regex below settles on.
    if [ "$line" != "${line%<<*}" ]; then
      before_op="${line%<<*}"
      dq="$(printf '%s' "$before_op" | tr -cd '"' | wc -c | tr -d '[:space:]')"
      sq="$(printf '%s' "$before_op" | tr -cd "'" | wc -c | tr -d '[:space:]')"
      if [ $((dq % 2)) -eq 1 ] || [ $((sq % 2)) -eq 1 ]; then
        printf '%s' "${out}__QUOTED_HEREDOC_OPENER__"$'\n'
        return 0
      fi
    fi
    delim="$(printf '%s' "$line" \
      | sed -n -E "s/^.*[^<]<<-?[[:space:]]*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?.*\$/\\1/p")"
    if [ -n "$delim" ]; then
      in_body=1
    fi
  done <<< "$text"
  if [ "$in_body" -eq 1 ]; then
    out="${out}__UNTERMINATED_HEREDOC__"$'\n'
  fi
  printf '%s' "$out"
}

# Maximum recursion depth for nested command substitution / loop bodies.
_RO_MAX_DEPTH=5
# Maximum command length that is parsed at all (see Step 0 below).
_RO_MAX_COMMAND_LEN=4000

is_readonly_bash_command() {
  local cmd="$1"
  local depth="${2:-0}"

  if [ "$depth" -gt "$_RO_MAX_DEPTH" ]; then
    echo "false"
    return 0
  fi

  # --- Step 0: length cap (M-4). The "$(...)" balance scan below walks the
  # remainder of the command ONE CHARACTER AT A TIME and rebuilds "$inner" on
  # every iteration, which is O(n^2) in the substitution's length (measured:
  # 5 KB => 0.9 s, 20 KB => 13.6 s of latency on a PostToolUse hook).
  # "$raw_command" is the only unbounded field left after the cap on
  # target_key, so cap it here. Nothing legitimately read-only is 4 KB long;
  # anything over the cap is classified as a write, i.e. the conservative side
  # (a read-only classification only ever RELAXES blocking).
  if [ "${#cmd}" -gt "$_RO_MAX_COMMAND_LEN" ]; then
    echo "false"
    return 0
  fi

  cmd="$(printf '%s' "$cmd" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [ -z "$cmd" ]; then
    echo "false"
    return 0
  fi

  # --- Step 1: process substitution "<(...)" stays ambiguous => write. ---
  case "$cmd" in
    *'<('*)
      echo "false"
      return 0
      ;;
  esac

  # --- Step 2: command substitution "$(...)" / backticks.
  # Rather than treating them as an automatic write (#1641), extract the inner
  # command, classify it RECURSIVELY, and replace the substitution with the
  # inert placeholder "SUBST". A write inside the substitution (e.g.
  # "$(rm -rf /tmp/x)", "$(git push)") still makes the whole command a write.
  while :; do
    case "$cmd" in
      *'$('*)
        local before="${cmd%%'$('*}"
        local after="${cmd#*'$('}"
        # Balance-aware scan for the matching ")".
        local inner="" rest="" d=1 i ch
        for ((i = 0; i < ${#after}; i++)); do
          ch="${after:$i:1}"
          if [ "$ch" = "(" ]; then
            d=$((d + 1))
          elif [ "$ch" = ")" ]; then
            d=$((d - 1))
            if [ "$d" -eq 0 ]; then
              rest="${after:$((i + 1))}"
              break
            fi
          fi
          inner="${inner}${ch}"
        done
        if [ "$d" -ne 0 ]; then
          # Unbalanced => unparseable => conservative write.
          echo "false"
          return 0
        fi
        if [ "$(is_readonly_bash_command "$inner" $((depth + 1)))" != "true" ]; then
          echo "false"
          return 0
        fi
        cmd="${before}SUBST${rest}"
        ;;
      *'`'*)
        # Backticks do not nest; take the text between the first pair.
        local b_before="${cmd%%'`'*}"
        local b_after="${cmd#*'`'}"
        case "$b_after" in
          *'`'*) ;;
          *) echo "false"; return 0 ;;
        esac
        local b_inner="${b_after%%'`'*}"
        local b_rest="${b_after#*'`'}"
        if [ "$(is_readonly_bash_command "$b_inner" $((depth + 1)))" != "true" ]; then
          echo "false"
          return 0
        fi
        cmd="${b_before}SUBST${b_rest}"
        ;;
      *)
        break
        ;;
    esac
  done

  # --- Step 3: strip harmless redirections BEFORE the ">" write check.
  # "2>&1", ">/dev/null", "2>/dev/null", "1>/dev/null", "&>/dev/null" produce no
  # observable side effect. Any OTHER ">" (a real file write) remains a write.
  # ">&N" is stripped ONLY for N in {1,2} (stdout/stderr). An arbitrary
  # descriptor writes wherever that fd was opened, so "cat x >&3" stays a write
  # (#1647 L-2). The trailing "[^0-9]" / "$" guard stops ">&10" from being read
  # as ">&1" plus a stray "0"; the two expressions differ only in whether the
  # redirection is followed by another character or ends the command.
  local stripped
  stripped="$(printf '%s' "$cmd" \
    | sed -E 's/[0-9]?>&[12]([^0-9])/ \1/g; s/[0-9]?>&[12]$/ /; s#[0-9]?&?>[[:space:]]*/dev/null# #g')"
  case "$stripped" in
    *'>'*)
      echo "false"
      return 0
      ;;
  esac
  cmd="$stripped"

  # --- Step 4: "||" is still NOT decomposed (which branch runs depends on the
  # first segment's exit code) => write. Preserved from #1629.
  case "$cmd" in
    *'||'*)
      echo "false"
      return 0
      ;;
  esac

  # --- Step 5: for / while loops (#1641).
  # Normalize ";do" / ";done" spacing, then classify the header and the
  # "do ... done" body separately. Both must be read-only.
  case "$cmd" in
    for\ *|while\ *)
      local norm
      norm="$(printf '%s' "$cmd" | sed -E 's/;[[:space:]]*do([[:space:]]|$)/ ; do /g; s/;[[:space:]]*done/ ; done/g')"
      case "$norm" in
        *' do '*'done'*) ;;
        *) echo "false"; return 0 ;;
      esac
      local head="${norm%% do *}"
      local tail_part="${norm#* do }"
      local body="${tail_part%done*}"
      head="$(printf '%s' "$head" | sed -e 's/[[:space:]]*;[[:space:]]*$//')"
      body="$(printf '%s' "$body" | sed -e 's/[[:space:]]*;[[:space:]]*$//')"

      case "$head" in
        # "for VAR in <words>" — pure iteration, no side effect. The <words>
        # already had any substitution validated in Step 2.
        for\ [A-Za-z_]*\ in\ *)
          ;;
        while\ *)
          # The while CONDITION is a real command — classify it.
          local wcond="${head#while }"
          if [ "$(is_readonly_bash_command "$wcond" $((depth + 1)))" != "true" ]; then
            echo "false"
            return 0
          fi
          ;;
        *)
          echo "false"
          return 0
          ;;
      esac

      is_readonly_bash_command "$body" $((depth + 1))
      return 0
      ;;
  esac

  # --- Step 6: compound command — split on "&&", ";", a single "|", or a
  # NEWLINE and require EVERY segment to be read-only (#1629, #1647 M-5).
  # A newline separates statements exactly like ";"; before #1647 it was not a
  # separator at all, so a multi-line command fell through to
  # is_readonly_single_command, whose "read -ra" only ever saw the FIRST line
  # ("git status\nrm -rf build" => read-only).
  #
  # Order matters: the ">" (Step 3) and "||" (Step 4) checks above still ran
  # against the FULL text including any heredoc body, so those verdicts are
  # unchanged. Heredoc bodies are dropped only here, right before the split.
  # CR / CRLF are newlines too.
  cmd="${cmd//$'\r\n'/$'\n'}"
  cmd="${cmd//$'\r'/$'\n'}"
  if [[ "$cmd" == *$'\n'* ]]; then
    # A heredoc body needs a following line, so only a MULTI-LINE command can
    # have one — checking "<<" on a single-line command would misread a literal
    # "<<" (e.g. `echo "a << b"`) as an opener.
    case "$cmd" in
      *'<<'*)
        cmd="$(_strip_heredoc_bodies "$cmd")"
        ;;
    esac
    # A BLANK line is not a statement, so drop blank lines before splitting;
    # otherwise they would look like an empty — i.e. ambiguous — segment. A
    # genuinely empty segment from a trailing ";" or "&&" still means write.
    cmd="$(printf '%s' "$cmd" | sed -e '/^[[:space:]]*$/d')"
    if [ -z "$cmd" ]; then
      echo "false"
      return 0
    fi
  fi
  if [[ "$cmd" == *'&&'* || "$cmd" == *';'* || "$cmd" == *'|'* || "$cmd" == *$'\n'* ]]; then
    local normalized="$cmd"
    normalized="${normalized//&&/$'\n'}"
    normalized="${normalized//;/$'\n'}"
    normalized="${normalized//|/$'\n'}"
    local seg
    while IFS= read -r seg; do
      seg="$(printf '%s' "$seg" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [ -z "$seg" ]; then
        echo "false"
        return 0
      fi
      if [ "$(is_readonly_single_command "$seg")" != "true" ]; then
        echo "false"
        return 0
      fi
    done <<< "$normalized"
    echo "true"
    return 0
  fi

  is_readonly_single_command "$cmd"
}

input=$(cat)

# Extract tool info
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // "unknown"')
# Bash commands are NOT files. Feeding tool_input.command into file_path made
# the hard-block message report a command fragment as a "file" and let Check 1
# ("Same file ... edited") fire on Bash at all (#1641). Keep the command text in
# a SEPARATE field (target_key) so tool+target repetition detection (Check 3 /
# Signal 3) still works, while the file-oriented checks see nothing for Bash.
#
# 1000 (was 300, originally 120): a short cutoff let two genuinely different
# long Bash commands collide on their shared prefix, causing a false-positive
# same-path/same-tool+target hard-block (#1629). Truncation alone can never
# remove that collision class, so truncate_key() ALSO appends the ORIGINAL
# length: two values that share the capped prefix but differ in total length
# no longer produce the same key (M-3).
TARGET_KEY_CAP=1000

truncate_key() {
  local v="$1"
  if [ "${#v}" -gt "$TARGET_KEY_CAP" ]; then
    printf '%s' "${v:0:$TARGET_KEY_CAP}#len=${#v}"
  else
    printf '%s' "$v"
  fi
}

if [ "$tool_name" = "Bash" ]; then
  file_path=""
  # ".tool_input.file_path" is a defensive fallback only: the real Bash tool has
  # no file_path parameter, but a caller (or a test fixture) may still supply one
  # as the target identifier. The command text wins whenever it is present.
  target_key=$(truncate_key "$(printf '%s' "$input" | jq -r '.tool_input.command // .tool_input.file_path // ""')")
else
  file_path_full=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
  # file_path is display/guard only (basename in the messages); target_key is
  # the value matched against history, so only it carries the length tag.
  # "|| true": same broken-pipe class as output_preview below (#1647 M-6) —
  # an over-cap file_path would make head close the pipe and take the hook
  # down through pipefail. The captured bytes are unaffected.
  file_path=$(printf '%s' "$file_path_full" | head -c "$TARGET_KEY_CAP" || true)
  target_key=$(truncate_key "$file_path_full")
fi
is_error=$(printf '%s' "$input" | jq -r '.tool_output.is_error // false')
# "head -c 200" closes the pipe after 200 bytes. Once tool_output.output is
# larger than the pipe buffer (~64 KB), jq keeps writing, dies of SIGPIPE
# (exit 141), and "set -o pipefail" + "set -e" aborted the ENTIRE hook before
# the history entry was ever appended — a 300 KB tool output silently erased
# the record it was supposed to create (#1647 M-6). Two independent guards:
# (a) slice inside jq so nothing large is piped at all, and (b) "|| true" so a
# broken pipe can never again take the hook down. The byte cap is still
# enforced by head (jq slices by codepoint, head by byte, and 200 codepoints
# are always >= 200 bytes, so the resulting bytes are unchanged).
output_preview=$(printf '%s' "$input" \
  | jq -r '(.tool_output.output // "" | tostring)[0:200]' \
  | head -c 200 || true)
raw_command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Distinguish "the same file edited 3 times with DIFFERENT content" (a normal
# incremental-edit workflow — the #1641 false positive) from "the same edit
# repeated 3 times" (a genuine stuck loop). Only the latter should hard-block.
# Alphanumerics-only + length cap: deterministic, platform-independent (no
# md5sum, absent on macOS) and safe to embed in a grep pattern.
edit_hash=""
if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; then
  edit_hash=$(printf '%s' "$input" \
    | jq -r '(.tool_input.old_string // .tool_input.content // .tool_input.new_string // "")
             | gsub("[^A-Za-z0-9]"; "") | .[0:120]')
fi

# History entries are written by jq, so their "path" values are JSON-ENCODED.
# Matching them requires the SAME encoding, not the raw text: a raw value
# containing a quote (common in Bash commands) can never match the encoded
# form. The previous BRE escaping was doubly broken — in POSIX BRE "( ) + ? { |"
# are literals, so escaping them turned them INTO operators and silently
# stopped matching. Encode once here and match with grep -F (fixed string).
target_key_json=$(jq -n --arg v "$target_key" '$v')
path_match="\"path\":${target_key_json}"

is_readonly="false"
if [ "$tool_name" = "Bash" ]; then
  is_readonly=$(is_readonly_bash_command "$raw_command")
fi

# Session-scoped history
HISTORY_FILE="/tmp/.claude-tool-history-${PPID}"

# Create entry
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Generate error hash for deduplication (first 50 chars of error)
error_hash=""
if [ "$is_error" = "true" ]; then
  error_hash=$(printf '%s' "$output_preview" | head -c 50 | md5sum 2>/dev/null | cut -d' ' -f1 || printf '%s\n' "unknown")
fi

# "path" holds $target_key — a file path for file tools, the command text for
# Bash (#1641). Keeping Bash commands in this field preserves Check 3 / Signal 3
# repetition detection while file_path stays empty for Bash.
entry=$(jq -cn \
  --arg ts "$timestamp" \
  --arg tool "$tool_name" \
  --arg path "$target_key" \
  --arg err "$is_error" \
  --arg hash "$error_hash" \
  --arg ehash "$edit_hash" \
  --arg preview "$output_preview" \
  --arg readonly "$is_readonly" \
  '{timestamp: $ts, tool: $tool, path: $path, is_error: $err, error_hash: $hash, edit_hash: $ehash, preview: $preview, readonly: $readonly}')

printf '%s\n' "$entry" >> "$HISTORY_FILE"

# Ring buffer: keep last 100 entries
if [ -f "$HISTORY_FILE" ]; then
  line_count=$(wc -l < "$HISTORY_FILE")
  if [ "$line_count" -gt 100 ]; then
    tail -100 "$HISTORY_FILE" > "${HISTORY_FILE}.tmp"
    mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
  fi
fi

# --- Detection Logic ---

# Only check for patterns if we have enough history
if [ ! -f "$HISTORY_FILE" ]; then
  printf '%s\n' "$input"
  exit 0
fi

recent_count=$(wc -l < "$HISTORY_FILE")
if [ "$recent_count" -lt 3 ]; then
  printf '%s\n' "$input"
  exit 0
fi

stuck_detected=false
signal_type=""
pattern_desc=""
occurrence_count=0
threshold=0
recovery=""

# Signal 1: Repeated error (same error_hash 3+ times in last 10 entries)
if [ "$is_error" = "true" ] && [ -n "$error_hash" ]; then
  error_repeat=$(tail -10 "$HISTORY_FILE" | grep -c "\"error_hash\":\"${error_hash}\"" 2>/dev/null || printf '%s\n' "0")
  if [ "$error_repeat" -ge 3 ]; then
    stuck_detected=true
    signal_type="Repeated error"
    pattern_desc="Same error appeared ${error_repeat} times in last 10 tool calls"
    occurrence_count=$error_repeat
    threshold=3
    recovery="Rephrase the task or try a different approach"
  fi
fi

# Signal 2: Edit loop (same file edited 3+ times in last 8 entries)
if [ "$stuck_detected" = false ] && { [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; }; then
  if [ -n "$file_path" ]; then
    edit_repeat=$(tail -8 "$HISTORY_FILE" | grep -cF -e "$path_match" 2>/dev/null || true)
    [ -n "$edit_repeat" ] || edit_repeat=0
    if [ "$edit_repeat" -ge 3 ]; then
      stuck_detected=true
      signal_type="Edit loop"
      pattern_desc="$(basename -- "$file_path") edited ${edit_repeat} times in last 8 calls"
      occurrence_count=$edit_repeat
      threshold=3
      recovery="Try a different file or approach instead of re-editing"
    fi
  fi
fi

# Signal 3: Tool spam (same tool 5+ times in last 8 entries)
# Read-only Bash polling is excluded from this count (issue #1629): skip
# entirely when the CURRENT call is read-only, and exclude prior read-only
# entries from the historical count so a mix of harmless read-only Bash
# calls (git status / gh view / ls / ...) doesn't inflate the "same tool
# called N times" advisory.
if [ "$stuck_detected" = false ] && [ "$is_readonly" != "true" ]; then
  tool_repeat=$(tail -8 "$HISTORY_FILE" | grep -v "\"readonly\":\"true\"" | grep -c "\"tool\":\"${tool_name}\"" 2>/dev/null || printf '%s\n' "0")
  if [ "$tool_repeat" -ge 5 ]; then
    stuck_detected=true
    signal_type="Tool loop"
    pattern_desc="${tool_name} called ${tool_repeat} times in last 8 calls"
    occurrence_count=$tool_repeat
    threshold=5
    recovery="Step back and reconsider the approach"
  fi
fi

# Output advisory if stuck detected
if [ "$stuck_detected" = true ]; then
  echo "" >&2
  echo "--- [Stuck Detection] Loop detected ---" >&2
  echo "  Signal: ${signal_type}" >&2
  echo "  Pattern: ${pattern_desc}" >&2
  echo "  Occurrences: ${occurrence_count}/${threshold}" >&2
  echo "  💡 Recovery: ${recovery}" >&2
  echo "----------------------------------------" >&2
fi

# --- Hard Block Detection (extreme stuck loops) ---
# Check if the same operation has been repeated HARD_BLOCK_THRESHOLD+ times consecutively.
# This catches cases where advisory warnings are being ignored.

hard_block=false
hard_block_reason=""

if [ -f "$HISTORY_FILE" ]; then
  last_n=$(tail -"$HARD_BLOCK_THRESHOLD" "$HISTORY_FILE" 2>/dev/null)
  last_n_count=$(printf '%s\n' "$last_n" | wc -l | tr -d ' ')

  if [ "$last_n_count" -ge "$HARD_BLOCK_THRESHOLD" ]; then
    # Check 1: Same file edited with the SAME content HARD_BLOCK_THRESHOLD+
    # times consecutively. Narrowed in #1641: three DIFFERENT edits to one file
    # is a normal incremental workflow (observed repeatedly on wiki/rule/doc
    # files), not a stuck loop — only an IDENTICAL repeated edit blocks. Both
    # the path AND the edit_hash must match.
    # (skip when current call is a read-only Bash command — repeated read-only
    # polling of the same target is not a stuck-loop signal; see #1625)
    # Bash never reaches here — file_path is empty for Bash (#1641), and
    # edit_hash is empty too; repeated Bash commands are handled by Check 3
    # via target_key instead.
    if [ "$is_readonly" != "true" ] && [ -n "$file_path" ]; then
      consecutive_file=$(printf '%s\n' "$last_n" \
        | grep -F -e "$path_match" \
        | grep -cF -e "\"edit_hash\":\"${edit_hash}\"" 2>/dev/null || true)
      [ -n "$consecutive_file" ] || consecutive_file=0
      if [ "$consecutive_file" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        hard_block_reason="Same file ($(basename -- "$file_path")) received the identical edit ${consecutive_file} consecutive times"
      fi
    fi

    # Check 2: Same error repeated HARD_BLOCK_THRESHOLD+ times consecutively
    if [ "$hard_block" = false ] && [ "$is_error" = "true" ] && [ -n "$error_hash" ]; then
      consecutive_error=$(printf '%s\n' "$last_n" | grep -c "\"error_hash\":\"${error_hash}\"" 2>/dev/null || printf '%s\n' "0")
      if [ "$consecutive_error" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        hard_block_reason="Same error repeated ${consecutive_error} consecutive times"
      fi
    fi

    # Check 3: Same tool+target combination HARD_BLOCK_THRESHOLD+ times
    # consecutively. Uses target_key (a file path for file tools, the command
    # text for Bash) so repeated identical Bash commands are still blocked
    # after file_path was emptied for Bash (#1641).
    # (skip when current call is a read-only Bash command — see Check 1 note)
    # The edit_hash filter mirrors Check 1's #1641 narrowing: without it this
    # check re-creates the very false positive Check 1 was narrowed to remove
    # (tool=Edit + same path fires at 3 regardless of content). For Bash the
    # filter is a no-op — every Bash history entry carries edit_hash "".
    if [ "$hard_block" = false ] && [ "$is_readonly" != "true" ] && [ -n "$target_key" ]; then
      consecutive_tool_target=$(printf '%s\n' "$last_n" \
        | grep -F -e "\"tool\":\"${tool_name}\"" \
        | grep -F -e "$path_match" \
        | grep -cF -e "\"edit_hash\":\"${edit_hash}\"" 2>/dev/null || true)
      [ -n "$consecutive_tool_target" ] || consecutive_tool_target=0
      if [ "$consecutive_tool_target" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        # Do NOT call basename() on a Bash target: a command is not a path, and
        # basename() on command text produced the misleading "Same file (pr)"
        # style message reported in #1641.
        if [ "$tool_name" = "Bash" ]; then
          hard_block_reason="Identical Bash command repeated ${consecutive_tool_target} times: $(printf '%s' "$target_key" | head -c 60)"
        else
          hard_block_reason="${tool_name} called on $(basename -- "$target_key") ${consecutive_tool_target} consecutive times"
        fi
      fi
    fi
  fi
fi

if [ "$hard_block" = true ]; then
  echo "" >&2
  echo "=== [Stuck Detection] HARD BLOCK ===" >&2
  echo "  ${hard_block_reason}" >&2
  echo "  Threshold: ${HARD_BLOCK_THRESHOLD} consecutive identical operations" >&2
  echo "  Action: Blocking this tool call to break the stuck loop." >&2
  echo "  Recovery: Step back, re-read the error, and try a fundamentally different approach." >&2
  echo "=====================================" >&2
  printf '%s\n' "$input"
  HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
  if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
    HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
    echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
  fi
  exit 2
fi

# Pass through
printf '%s\n' "$input"
HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
  HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
  echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
fi
exit 0
