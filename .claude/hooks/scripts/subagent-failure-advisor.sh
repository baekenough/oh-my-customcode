#!/bin/bash
set -euo pipefail

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

# Subagent Failure Advisor Hook
# Trigger: PostToolUseFailure (matcher: Agent / Task tool)
# Purpose: Advisory-only. When an Agent/Task tool call fails, tell the model not to
#   auto-continue as if the subagent had succeeded. Replaces the removed
#   `type: "prompt"` SubagentStop hook (#1631), whose LLM judge was structurally
#   always "not yet completed" and produced a Stop-hook-feedback re-injection loop.
# Why not SubagentStop (#1775): the SubagentStop payload has no tool_response /
#   tool_output / is_error (measured keys on CC 2.1.310, `claude -p`, haiku, one run, see
#   https://github.com/baekenough/oh-my-customcode/issues/1775#issuecomment-6404861043: agent_id, agent_transcript_path, agent_type,
#   background_tasks, cwd, effort, hook_event_name, last_assistant_message,
#   permission_mode, prompt_id, session_crons, session_id, stop_hook_active,
#   transcript_path), so a failure check there can never fire.
# Input (PostToolUseFailure; measured on CC 2.1.310, `claude -p`, haiku, one run, unknown
#   subagent_type; additionalContext delivery evidence is weak because the probe prompt named
#   the marker; measured fields only: tool_name, is_interrupt, error (string), see
#   https://github.com/baekenough/oh-my-customcode/issues/1775#issuecomment-6405197553).
#   Other fields (tool_input sub-fields, duration_ms, tool_use_id, hook_event_name, ...) come from
#   the PostToolUseFailure input table in https://code.claude.com/docs/en/hooks.md, not measured.
# Output: stdout JSON {"hookSpecificOutput":{"hookEventName":"PostToolUseFailure",
#   "additionalContext": "..."}} -- observed as delivered to the model (weak evidence, see above).
#   Never a `decision` field; the only explicit exit is exit 0. Silent for interrupts, non-Agent/Task tools,
#   missing error, or non-object stdin.

input=$(cat)

# Single jq pass; any parse failure or non-object stdin -> silent exit 0.
fields=$(printf '%s' "$input" | jq -r '
  if type == "object" then
    [ (.tool_name // ""),
      (if .is_interrupt == true then "1" else "0" end),
      ((.tool_input.subagent_type // "unknown") | tostring | .[0:80]),
      ((.tool_input.description // "") | tostring | gsub("[\n\r\t]"; " ") | .[0:120]),
      ((.error // "") | tostring | gsub("[\n\r\t]"; " ") | .[0:200])
    ] | join("\u001f")
  else empty end' 2>/dev/null || true)

[ -n "$fields" ] || exit 0

IFS=$'\x1f' read -r tool_name is_interrupt subagent_type description error_text <<EOT
$fields
EOT

case "$tool_name" in
  Agent|Task) ;;
  *) exit 0 ;;
esac
[ "$is_interrupt" = "0" ] || exit 0
[ -n "$error_text" ] || exit 0

msg="[Subagent Failure Advisor] ${tool_name} call failed (subagent_type=${subagent_type}"
[ -z "$description" ] || msg="${msg}, description=${description}"
msg="${msg}): ${error_text}. Fix the arguments (e.g. the subagent_type) and retry once; if the failure is a permission denial or repeats, report it and do not pretend the subagent ran."

jq -n --arg ctx "$msg" '{hookSpecificOutput:{hookEventName:"PostToolUseFailure",additionalContext:$ctx}}' 2>/dev/null || true
exit 0
