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
# Conservative: any ambiguity (chaining, redirection, substitution, or an
# unrecognized command/subcommand) is treated as NOT read-only (write).
# Used ONLY to exclude read-only Bash polling from Hard Block Checks 1 and 3
# (same-path / same-tool+target consecutive-repeat blocking) below — Signal 1
# (repeated-error advisory) and Hard Block Check 2 (same error hash) are
# intentionally unaffected: repeated errors are a genuine stuck signal
# regardless of read/write (issue #1625).
is_readonly_bash_command() {
  local cmd="$1"
  cmd="$(printf '%s' "$cmd" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [ -z "$cmd" ]; then
    echo "false"
    return 0
  fi

  # Any chaining/redirection/substitution metachar => ambiguous, treat as write
  case "$cmd" in
    *'>'*|*'|'*|*'&&'*|*';'*|*'$('*|*'`'*|*'<('*)
      echo "false"
      return 0
      ;;
  esac

  local parts=()
  read -ra parts <<< "$cmd"
  local w1="${parts[0]:-}"
  local w2="${parts[1]:-}"
  local w3="${parts[2]:-}"

  case "$w1" in
    ls|cat|head|tail|grep|rg|wc|jq|md5|md5sum|type|command|which|echo|printf|pwd|date)
      echo "true"
      return 0
      ;;
    find)
      case "$cmd" in
        *-delete*|*-exec*|*-fprintf*)
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
          echo "$ok"
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

input=$(cat)

# Extract tool info
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // "unknown"')
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.command // ""' | head -c 120)
is_error=$(printf '%s' "$input" | jq -r '.tool_output.is_error // false')
output_preview=$(printf '%s' "$input" | jq -r '.tool_output.output // ""' | head -c 200)
raw_command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

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
  error_hash=$(echo "$output_preview" | head -c 50 | md5sum 2>/dev/null | cut -d' ' -f1 || echo "unknown")
fi

entry=$(jq -cn \
  --arg ts "$timestamp" \
  --arg tool "$tool_name" \
  --arg path "$file_path" \
  --arg err "$is_error" \
  --arg hash "$error_hash" \
  --arg preview "$output_preview" \
  '{timestamp: $ts, tool: $tool, path: $path, is_error: $err, error_hash: $hash, preview: $preview}')

echo "$entry" >> "$HISTORY_FILE"

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
  echo "$input"
  exit 0
fi

recent_count=$(wc -l < "$HISTORY_FILE")
if [ "$recent_count" -lt 3 ]; then
  echo "$input"
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
  error_repeat=$(tail -10 "$HISTORY_FILE" | grep -c "\"error_hash\":\"${error_hash}\"" 2>/dev/null || echo "0")
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
    escaped_path=$(echo "$file_path" | sed 's/[.[\*^$()+?{|]/\\&/g')
    edit_repeat=$(tail -8 "$HISTORY_FILE" | grep -c "\"path\":\"${escaped_path}\"" 2>/dev/null || echo "0")
    if [ "$edit_repeat" -ge 3 ]; then
      stuck_detected=true
      signal_type="Edit loop"
      pattern_desc="$(basename "$file_path") edited ${edit_repeat} times in last 8 calls"
      occurrence_count=$edit_repeat
      threshold=3
      recovery="Try a different file or approach instead of re-editing"
    fi
  fi
fi

# Signal 3: Tool spam (same tool 5+ times in last 8 entries)
if [ "$stuck_detected" = false ]; then
  tool_repeat=$(tail -8 "$HISTORY_FILE" | grep -c "\"tool\":\"${tool_name}\"" 2>/dev/null || echo "0")
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
  last_n_count=$(echo "$last_n" | wc -l | tr -d ' ')

  if [ "$last_n_count" -ge "$HARD_BLOCK_THRESHOLD" ]; then
    # Check 1: Same file edited HARD_BLOCK_THRESHOLD+ times consecutively
    # (skip when current call is a read-only Bash command — repeated read-only
    # polling of the same target is not a stuck-loop signal; see #1625)
    if [ "$is_readonly" != "true" ] && [ -n "$file_path" ]; then
      escaped_path=$(echo "$file_path" | sed 's/[.[\*^$()+?{|]/\\&/g')
      consecutive_file=$(echo "$last_n" | grep -c "\"path\":\"${escaped_path}\"" 2>/dev/null || echo "0")
      if [ "$consecutive_file" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        hard_block_reason="Same file ($(basename "$file_path")) edited ${consecutive_file} consecutive times"
      fi
    fi

    # Check 2: Same error repeated HARD_BLOCK_THRESHOLD+ times consecutively
    if [ "$hard_block" = false ] && [ "$is_error" = "true" ] && [ -n "$error_hash" ]; then
      consecutive_error=$(echo "$last_n" | grep -c "\"error_hash\":\"${error_hash}\"" 2>/dev/null || echo "0")
      if [ "$consecutive_error" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        hard_block_reason="Same error repeated ${consecutive_error} consecutive times"
      fi
    fi

    # Check 3: Same tool+target combination HARD_BLOCK_THRESHOLD+ times consecutively
    # (skip when current call is a read-only Bash command — see Check 1 note)
    if [ "$hard_block" = false ] && [ "$is_readonly" != "true" ] && [ -n "$file_path" ]; then
      escaped_path=$(echo "$file_path" | sed 's/[.[\*^$()+?{|]/\\&/g')
      consecutive_tool_target=$(echo "$last_n" | grep "\"tool\":\"${tool_name}\"" | grep -c "\"path\":\"${escaped_path}\"" 2>/dev/null || echo "0")
      if [ "$consecutive_tool_target" -ge "$HARD_BLOCK_THRESHOLD" ]; then
        hard_block=true
        hard_block_reason="${tool_name} called on $(basename "$file_path") ${consecutive_tool_target} consecutive times"
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
  echo "$input"
  HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
  if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
    HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
    echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
  fi
  exit 2
fi

# Pass through
echo "$input"
HOOK_END=$(date +%s%N 2>/dev/null || echo 0)
if [ "$HOOK_START" != "0" ] && [ "$HOOK_END" != "0" ]; then
  HOOK_MS=$(( (HOOK_END - HOOK_START) / 1000000 ))
  echo "[Hook Perf] $(basename "$0"): ${HOOK_MS}ms" >> "/tmp/.claude-hook-perf-${PPID}.log"
fi
exit 0
