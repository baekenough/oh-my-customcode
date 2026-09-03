#!/bin/bash
# Secret Output Filter Hook — Detect potential secrets in tool output
# Trigger: PostToolUse on Bash, Read, Grep
# Purpose: Advisory warning when potential secrets detected in output
# Protocol: stdin JSON -> scan -> stdout pass-through
# Always exits 0 (advisory only, never blocks)

set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Non-object stdin guard (#1650 B) — rejects ONLY non-object stdin, which carries
# no scannable payload anyway; a well-formed object always reaches the scan below.
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

tool_name=$(printf '%s\n' "$input" | jq -r '.tool_name? // "unknown"')

# Collect every text-bearing field of the payload into one scan buffer.
#
# PostToolUse carries the result under `tool_response`, NOT `tool_output`
# (measured 2026-09-03: 1764 PostToolUse payloads echoed into this project's
# session transcripts had `tool_response` 1764/1764 and `tool_output` 0/1764;
# the CC 2.1.259 embedded hook reference documents `"tool_response": {...}
# // PostToolUse only`). Reading `.tool_output.output` therefore always yielded
# "" and the scan below never ran — every AWS key, private key and PAT passed
# through unflagged.
#
# Measured text-bearing fields, by tool:
#   Bash   .tool_response.stdout / .stderr
#   Read   .tool_response.file.content
#   Write  .tool_response.content
#   Agent  .tool_response.prompt
#   MCP    .tool_response (string) or .tool_response.content[].text
# `.tool_output.output` and a string-shaped `.tool_output` are kept as
# fallbacks for events that still use the older shape (e.g. SubagentStop).
#
# `?` suppresses jq path errors when a field is a scalar rather than an object;
# every branch is optional, so an unexpected shape degrades to "" instead of
# aborting the hook under `set -euo pipefail`.
output=$(printf '%s\n' "$input" | jq -r '
  [
    (.tool_response?      | if type == "string" then . else empty end),
    (.tool_response?.stdout?        | strings),
    (.tool_response?.stderr?        | strings),
    (.tool_response?.content?       | strings),
    (.tool_response?.content?       | if type == "array"
                                      then map(.text? | strings) | join("\n")
                                      else empty end),
    (.tool_response?.file?.content? | strings),
    (.tool_response?.prompt?        | strings),
    (.tool_response?.output?        | strings),
    (.tool_output?        | if type == "string" then . else empty end),
    (.tool_output?.output?          | strings)
  ]
  | map(select(. != "")) | join("\n")
' 2>/dev/null) || output=""

# Skip if no output
if [ -z "$output" ] || [ "$output" = "null" ]; then
  printf '%s\n' "$input"
  exit 0
fi

# Secret patterns to detect
detected=false

# AWS Access Key ID
if echo "$output" | grep -qE 'AKIA[0-9A-Z]{16}'; then
  echo "[Security] Potential AWS Access Key detected in ${tool_name} output" >&2
  detected=true
fi

# OpenAI/Anthropic API Key
if echo "$output" | grep -qE 'sk-[a-zA-Z0-9]{32,}'; then
  echo "[Security] Potential API key (sk-*) detected in ${tool_name} output" >&2
  detected=true
fi

# GitHub Personal Access Token
if echo "$output" | grep -qE 'ghp_[a-zA-Z0-9]{36}'; then
  echo "[Security] Potential GitHub PAT detected in ${tool_name} output" >&2
  detected=true
fi

# Private Key
if echo "$output" | grep -qE -- '-----BEGIN.*PRIVATE KEY-----'; then
  echo "[Security] Potential private key detected in ${tool_name} output" >&2
  detected=true
fi

# Bearer Token (long)
if echo "$output" | grep -qE 'Bearer [a-zA-Z0-9._-]{20,}'; then
  echo "[Security] Potential Bearer token detected in ${tool_name} output" >&2
  detected=true
fi

# GitHub OAuth Token
if echo "$output" | grep -qE 'gho_[a-zA-Z0-9]{36}'; then
  echo "[Security] Potential GitHub OAuth token detected in ${tool_name} output" >&2
  detected=true
fi

# GitHub Fine-Grained PAT
if echo "$output" | grep -qE 'github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}'; then
  echo "[Security] Potential GitHub Fine-Grained PAT detected in ${tool_name} output" >&2
  detected=true
fi

# GitHub Actions Token
if echo "$output" | grep -qE 'ghs_[a-zA-Z0-9]{36}'; then
  echo "[Security] Potential GitHub Actions token detected in ${tool_name} output" >&2
  detected=true
fi

# npm Token
if echo "$output" | grep -qE 'npm_[a-zA-Z0-9]{36}'; then
  echo "[Security] Potential npm token detected in ${tool_name} output" >&2
  detected=true
fi

# Slack Token
if echo "$output" | grep -qE 'xox[bsarp]-[a-zA-Z0-9-]{10,}'; then
  echo "[Security] Potential Slack token detected in ${tool_name} output" >&2
  detected=true
fi

# Docker Hub PAT
if echo "$output" | grep -qE 'dckr_pat_[a-zA-Z0-9_-]{20,}'; then
  echo "[Security] Potential Docker Hub PAT detected in ${tool_name} output" >&2
  detected=true
fi

if [ "$detected" = true ]; then
  echo "[Security] Review output carefully — do NOT commit or expose secrets" >&2
fi

# Pass through (always)
printf '%s\n' "$input"
exit 0
