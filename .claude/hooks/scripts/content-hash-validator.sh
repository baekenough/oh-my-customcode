#!/bin/bash
# Content-Hash Validator — Detect stale file state for Edit operations
# Trigger: PostToolUse on Read/Edit/Write (stores or refreshes the hash), PreToolUse on Edit (validates)
# Purpose: Advisory warning when file content changed outside the model's own Read/Edit/Write
# Protocol (#1885, per event):
#   PostToolUse (Read|Edit|Write): store/refresh hash of .tool_input.file_path, stdin pass-through to stdout.
#   PreToolUse (Edit): validate; stdout is one JSON line (hookSpecificOutput.additionalContext) or nothing.
#     No stderr, no passthrough (exit-0 stderr never reaches the model; measured CC 2.1.310, #1775).
#   Missing hook_event_name: Read and Write store, Edit VALIDATES (Edit was historically PreToolUse-only).
# Store: per-path atomic files in /tmp/.claude-content-hashes-${PPID}.d/<cksum of path>
#   (line 1 = hash, line 2 = path). Each entry is written to a unique temp file in the same dir, then
#   mv -f'd onto the entry, so parallel hook calls never share a read-modify-write file. No ring buffer:
#   the directory is session-scoped (PPID) and entries are tiny. Every state operation is wrapped so a
#   failure never aborts or leaks stderr.
# Known limitation: a file rewritten after its hash was stored (a parallel PostToolUse formatter hook such
#   as prettier/gofmt/ruff, or a Bash edit) can still trigger the warning on the next Edit.
# Always exits 0 (advisory only, never blocks)

set -uo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0.
# Hooks must never crash (R021). (#1650)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

STORE_DIR="/tmp/.claude-content-hashes-${PPID}.d"

ctx=""
add() { if [ -z "$ctx" ]; then ctx="$1"; else ctx="${ctx}"$'\n'"$1"; fi; }

tool_name=$(printf '%s\n' "$input" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo unknown)
event=$(printf '%s\n' "$input" | jq -r '.hook_event_name // ""' 2>/dev/null || echo "")
file_path=$(printf '%s\n' "$input" | jq -r '.tool_input.file_path? // ""' 2>/dev/null || echo "")

mode="other"
if [ "$event" = "PreToolUse" ]; then
  [ "$tool_name" = "Edit" ] && mode="validate"
elif [ "$event" = "" ]; then
  case "$tool_name" in
    Edit) mode="validate" ;;
    Read|Write) mode="store" ;;
  esac
else
  case "$tool_name" in Read|Edit|Write) mode="store" ;; esac
fi

file_hash() { md5 -q "$1" 2>/dev/null || md5sum "$1" 2>/dev/null | cut -d' ' -f1 || echo "unknown"; }
entry_for() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

case "$mode" in
  "store")
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
      {
        content_hash=$(file_hash "$file_path")
        mkdir -p "$STORE_DIR"
        tmp=$(mktemp "$STORE_DIR/.tmp.XXXXXX")
        printf '%s\n%s\n' "$content_hash" "$file_path" > "$tmp"
        mv -f "$tmp" "$STORE_DIR/$(entry_for "$file_path")"
      } 2>/dev/null || true
    fi
    ;;

  "validate")
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
      entry="$STORE_DIR/$(entry_for "$file_path")"
      stored_hash=""
      stored_path=""
      { stored_hash=$(sed -n 1p "$entry"); stored_path=$(sed -n 2p "$entry"); } 2>/dev/null || true

      if [ -n "$stored_hash" ] && [ "$stored_hash" != "unknown" ] && [ "$stored_path" = "$file_path" ]; then
        current_hash=$(file_hash "$file_path")

        if [ "$current_hash" != "unknown" ] && [ "$stored_hash" != "$current_hash" ]; then
          add "[Content-Hash] WARNING: $(basename "$file_path") may have changed since last Read"
          add "[Content-Hash] Stored hash: ${stored_hash:0:8}... Current: ${current_hash:0:8}..."
          add "[Content-Hash] Advisory: re-read the file before editing if unsure"
        fi
      fi
    fi
    ;;
esac

if [ "$mode" = "validate" ]; then
  # Emit advisory to the model (#1885); silent when nothing to advise.
  if [ -n "$ctx" ]; then
    jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  fi
else
  # PostToolUse paths and others: unchanged pass-through
  printf '%s\n' "$input"
fi
exit 0
