#!/bin/bash
set -euo pipefail

# Stuck Detector Hook
# Trigger: PostToolUse, tool matches "Edit|Write|Bash|Task"
# Purpose: Detect repetitive failure loops and advise recovery
# Protocol: stdin JSON -> process -> stdout pass-through, exit 0 always

input=$(cat)

# Extract tool info
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.command // ""' | head -c 120)
is_error=$(echo "$input" | jq -r '.tool_output.is_error // false')
output_preview=$(echo "$input" | jq -r '.tool_output.output // ""' | head -c 200)

# Session-scoped history
HISTORY_FILE="/tmp/.claude-tool-history-${PPID}"

# Create entry
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Generate error hash for deduplication (first 50 chars of error)
error_hash=""
if [ "$is_error" = "true" ]; then
  error_hash=$(echo "$output_preview" | head -c 50 | md5sum 2>/dev/null | cut -d' ' -f1 || echo "unknown")
fi

entry=$(jq -n \
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

# Pass through
echo "$input"
exit 0
