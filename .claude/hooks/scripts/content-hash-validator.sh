#!/bin/bash
# Content-Hash Validator — Detect stale file state for Edit operations
# Trigger: PostToolUse on Read (stores hashes), PreToolUse on Edit (validates)
# Purpose: Advisory warning when file content changed between Read and Edit
# Protocol: stdin JSON -> validate -> stdout pass-through
# Always exits 0 (advisory only, never blocks)

set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Hash store (PPID-scoped, session-only)
HASH_STORE="/tmp/.claude-content-hashes-${PPID}"

tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')

case "$tool_name" in
  "Read")
    # Store content hash for the file that was just read
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
      content_hash=$(md5 -q "$file_path" 2>/dev/null || md5sum "$file_path" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
      timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

      # Store hash entry (overwrite previous for same file)
      if [ -f "$HASH_STORE" ]; then
        # Remove old entry for this file
        grep -v "\"path\":\"${file_path}\"" "$HASH_STORE" > "${HASH_STORE}.tmp" 2>/dev/null || true
        mv "${HASH_STORE}.tmp" "$HASH_STORE" 2>/dev/null || true
      fi

      jq -cn \
        --arg path "$file_path" \
        --arg hash "$content_hash" \
        --arg ts "$timestamp" \
        '{path: $path, hash: $hash, stored_at: $ts}' >> "$HASH_STORE" 2>/dev/null || true
    fi
    ;;

  "Edit")
    # Validate that file hasn't changed since last Read
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

    if [ -n "$file_path" ] && [ -f "$HASH_STORE" ] && [ -f "$file_path" ]; then
      stored_hash=$(grep "\"path\":\"${file_path}\"" "$HASH_STORE" 2>/dev/null | tail -1 | jq -r '.hash // ""' 2>/dev/null || echo "")

      if [ -n "$stored_hash" ] && [ "$stored_hash" != "unknown" ]; then
        current_hash=$(md5 -q "$file_path" 2>/dev/null || md5sum "$file_path" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

        if [ "$current_hash" != "unknown" ] && [ "$stored_hash" != "$current_hash" ]; then
          echo "[Content-Hash] WARNING: $(basename "$file_path") may have changed since last Read" >&2
          echo "[Content-Hash] Stored hash: ${stored_hash:0:8}... Current: ${current_hash:0:8}..." >&2
          echo "[Content-Hash] Advisory: re-read the file before editing if unsure" >&2
        fi
      fi
    fi
    ;;
esac

# Ring buffer: keep last 200 entries
if [ -f "$HASH_STORE" ]; then
  line_count=$(wc -l < "$HASH_STORE" 2>/dev/null || echo "0")
  if [ "$line_count" -gt 200 ]; then
    tail -200 "$HASH_STORE" > "${HASH_STORE}.tmp"
    mv "${HASH_STORE}.tmp" "$HASH_STORE"
  fi
fi

# Always pass through
echo "$input"
exit 0
