#!/bin/bash
# Layer 4: Playwright/Chrome MCP Output Intelligence Compression
# Reduces MCP tool output by 94-96% using Haiku summarization
# Preserves ref= values for interactive flow continuity
# Source: adapted from treesoop/claude-native-plugin (MIT)

set -euo pipefail

input=$(cat)
tool_output=$(echo "$input" | jq -r '.tool_output // ""')

# Skip if output is small (< 3000 chars)
output_len=${#tool_output}
if [ "$output_len" -lt 3000 ]; then
  echo "$input"
  exit 0
fi

# Extract ref= values to preserve
refs=$(echo "$tool_output" | grep -oE 'ref="[^"]*"' | sort -u || true)

# Summarize using Haiku via subscription auth
summary=$(echo "$tool_output" | claude -p --model haiku "Summarize this browser page content concisely. Preserve ALL ref= attribute values exactly as they appear. Focus on: page structure, interactive elements with their ref values, visible text content, and any error messages." 2>/dev/null) || {
  # Fallback: return original on failure
  echo "$input"
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
echo "$input" | jq --arg summary "$summary" --arg savings "${savings}% reduced (${output_len}→${compressed_len} chars)" \
  '.tool_output = $summary | .["updatedMCPToolOutput"] = $summary'
