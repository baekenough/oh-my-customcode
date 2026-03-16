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

# Extract output to scan
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
output=$(echo "$input" | jq -r '.tool_output.output // ""')

# Skip if no output
if [ -z "$output" ] || [ "$output" = "null" ]; then
  echo "$input"
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
if echo "$output" | grep -qE '-----BEGIN.*PRIVATE KEY-----'; then
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
echo "$input"
exit 0
