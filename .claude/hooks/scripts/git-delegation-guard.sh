#!/bin/bash
# R010 git-delegation-guard hook
# Warns when git operations are delegated to a non-mgr-gitnerd agent via Agent/Task tool.
# WARN only - does NOT block (exit 0, passes input through).
#
# PPID Scoping Convention:
#   All session-scoped temp files MUST use $PPID (Claude Code parent PID),
#   NOT $$ (subprocess PID which changes per hook invocation).
#   Pattern: /tmp/.claude-{purpose}-${PPID}
#   See also: agent-teams-advisor.sh, context-budget-advisor.sh, stuck-detector.sh

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0
# instead of reflecting garbage back on stdout. The sibling hooks (audit-log.sh,
# model-escalation-advisor.sh, task-outcome-recorder.sh) all carry this guard;
# this one did not, so a non-object payload was echoed through verbatim. (#1656 F)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# `?` suppresses jq's "Cannot index <type> with string" when tool_input arrives as a
# scalar/array instead of an object (measured #1656 A: the bare form leaked a jq error to
# stderr on every non-object tool_input). 2>/dev/null + `|| echo ""` keep the hook silent
# and advisory-only even if jq itself fails for an unrelated reason.
agent_type=$(printf '%s\n' "$input" | jq -r '.tool_input.subagent_type? // ""' 2>/dev/null || echo "")
prompt=$(printf '%s\n' "$input" | jq -r '.tool_input.prompt? // ""' 2>/dev/null || echo "")

# R010 violation tracking file (PPID-scoped for session persistence)
VIOLATION_FILE="/tmp/.claude-r010-violations-${PPID}"

# Only warn when the delegated agent is NOT mgr-gitnerd
if [ "$agent_type" != "mgr-gitnerd" ]; then
  git_keywords=(
    "git add"
    "git commit"
    "git push"
    "git revert"
    "git merge"
    "git rebase"
    "git checkout"
    "git branch"
    "git reset"
    "git cherry-pick"
    "git tag"
  )

  for keyword in "${git_keywords[@]}"; do
    if echo "$prompt" | grep -qi "$keyword"; then
      echo "[Hook] WARNING: R010 violation detected - git operation ('$keyword') delegated to '$agent_type' instead of 'mgr-gitnerd'" >&2
      echo "[Hook] Per R010, all git operations (commit/push/branch/merge/etc.) MUST be delegated to mgr-gitnerd" >&2

      # Record violation for R021 promotion tracking
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $keyword $agent_type" >> "$VIOLATION_FILE"
      violation_count=$(wc -l < "$VIOLATION_FILE" 2>/dev/null | tr -d ' ')
      if [ "$violation_count" -ge 3 ]; then
        echo "[Hook] R010 violations: ${violation_count} this session — R021 promotion threshold reached" >&2
      fi

      break
    fi
  done
fi

# Always pass through - this hook is advisory only
printf '%s\n' "$input"
