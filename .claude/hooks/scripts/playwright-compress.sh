#!/bin/bash
# Layer 4: Playwright/Chrome MCP Output Intelligence Compression
# Reduces MCP tool output by 94-96% using Haiku summarization
# Preserves ref= values for interactive flow continuity
# Source: adapted from treesoop/claude-native-plugin (MIT)

set -euo pipefail

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0.
# Hooks must never crash (R021); jq parse errors would otherwise abort under `set -e`. (#1650)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0
# PostToolUse carries the tool result under `tool_response`, not `tool_output`
# (measured at v1.1.62: every PostToolUse record in this project's transcripts
# carried `tool_response` and none carried `tool_output`), so the previous
# `.tool_output` read always yielded "" and this hook never compressed anything.
# MCP responses arrive either as a bare string or as
# `{content: [{type:"text", text:...}]}`; `.tool_output` is kept as a fallback
# for events still using the older shape.
#
# MATCHER-SCOPED: `.stdout` and `.file.content` are read here only because this
# hook's matcher is `mcp__playwright__.*|mcp__claude-in-chrome__.*`, so those
# branches can never fire on a real Bash or Read result. This is a lossy hook —
# it REPLACES `.tool_response` with a Haiku summary — so widening the matcher to
# cover Bash/Read without first dropping those two branches would silently
# destroy genuine command output and file contents. (#1656 F)
tool_output=$(printf '%s\n' "$input" | jq -r '
  [
    (.tool_response?   | if type == "string" then . else empty end),
    (.tool_response?.content? | strings),
    (.tool_response?.content? | if type == "array"
                                then map(.text? | strings) | join("\n")
                                else empty end),
    (.tool_response?.stdout?  | strings),
    (.tool_response?.file?.content? | strings),
    (.tool_output?     | if type == "string" then . else empty end),
    (.tool_output?.output?    | strings)
  ]
  | map(select(. != "")) | join("\n")
' 2>/dev/null) || tool_output=""

# Skip if output is small (< 3000 chars)
output_len=${#tool_output}
if [ "$output_len" -lt 3000 ]; then
  printf '%s\n' "$input"
  exit 0
fi

# Extract ref= values to preserve
refs=$(echo "$tool_output" | grep -oE 'ref="[^"]*"' | sort -u || true)

# Summarize using Haiku via subscription auth
summary=$(echo "$tool_output" | claude -p --model haiku "Summarize this browser page content concisely. Preserve ALL ref= attribute values exactly as they appear. Focus on: page structure, interactive elements with their ref values, visible text content, and any error messages." 2>/dev/null) || {
  # Fallback: return original on failure
  printf '%s\n' "$input"
  exit 0
}

# Verify ref= preservation
if [ -n "$refs" ]; then
  missing_refs=""
  while IFS= read -r ref; do
    if ! echo "$summary" | grep -qF "$ref"; then
      missing_refs="$missing_refs $ref"
    fi
  done <<< "$refs"

  # Append missing refs if any
  if [ -n "$missing_refs" ]; then
    summary="$summary

[Preserved refs]:$missing_refs"
  fi
fi

# Return compressed output
compressed_len=${#summary}
savings=$(( (output_len - compressed_len) * 100 / output_len ))
printf '%s\n' "$input" | jq --arg summary "$summary" --arg savings "${savings}% reduced (${output_len}→${compressed_len} chars)" \
  '.tool_response = $summary | .tool_output = $summary | .["updatedMCPToolOutput"] = $summary'
