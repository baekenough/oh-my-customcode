#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Subagent Failure Advisor Hook
# Trigger: SubagentStop
# Purpose: Advisory-only replacement for the removed `type: "prompt"` SubagentStop hook
#   (#1631). The prompt hook asked an LLM judge whether the CURRENT session's own
#   background_tasks entry had transitioned to "completed" before allowing Stop —
#   but that transition only happens AFTER the SubagentStop hook chain resolves, so the
#   judgment was structurally always "not yet completed" for a subagent evaluating its
#   OWN stop. That produced a self-referential `Stop hook feedback:` re-injection loop
#   with no dedup, observed to repeat 8-10x per session before manual override.
# Fix: replace the blocking LLM judge with a plain stderr-only warning that never
#   triggers the Stop-hook-feedback re-injection path. No block, no LLM call, no loop.
# Protocol: stdin JSON -> read tool_output.is_error -> stderr warning if failed -> pass through -> exit 0 (always)

input=$(cat)

is_error=$(printf '%s\n' "$input" | jq -r '.tool_output.is_error // false' 2>/dev/null || echo "false")

if [ "$is_error" = "true" ]; then
  agent_type=$(printf '%s\n' "$input" | jq -r '.tool_input.subagent_type // .agent_type // "unknown"' 2>/dev/null || echo "unknown")
  error_summary=$(printf '%s\n' "$input" | jq -r '.tool_output.output // ""' 2>/dev/null | head -c 200)
  echo "" >&2
  echo "--- [Subagent Failure Advisor] background subagent (${agent_type}) reported an error ---" >&2
  echo "  ${error_summary}" >&2
  echo "  If it FAILED, do NOT auto-continue -- report the failure and wait for user input." >&2
  echo "-----------------------------------------------------------------------------------" >&2
fi

# Always pass through -- advisory only, never blocks, never triggers Stop hook feedback re-injection
printf '%s\n' "$input"
exit 0
