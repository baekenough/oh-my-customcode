#!/bin/bash
# R010 git-delegation-guard hook
# Warns when git operations are delegated to a non-mgr-gitnerd agent via Agent/Task tool.
# WARN only - does NOT block (exit 0, passes input through).

input=$(cat)

agent_type=$(echo "$input" | jq -r '.tool_input.subagent_type // ""')
prompt=$(echo "$input" | jq -r '.tool_input.prompt // ""')

# Only warn when the delegated agent is NOT mgr-gitnerd
if [ "$agent_type" != "mgr-gitnerd" ]; then
  git_keywords=(
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
      echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"rule\":\"R010\",\"type\":\"git-delegation\",\"detail\":\"'$keyword' delegated to '$agent_type' instead of mgr-gitnerd\"}" >> "/tmp/.claude-violations-${PPID}"
      break
    fi
  done
fi

# Always pass through - this hook is advisory only
echo "$input"
