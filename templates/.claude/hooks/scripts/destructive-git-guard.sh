#!/bin/bash
# R001/R021 destructive git guard hook
# Warns before commands that can discard working tree, untracked files, or branches.
# Advisory tier only: emits guidance, records PPID-scoped warnings, exits 0.
# Channel (#1885): exit-0 stderr never reaches the model; advice is delivered via stdout JSON
# hookSpecificOutput.additionalContext (measured CC 2.1.310, #1775). No stdin passthrough, no stderr.
#
# PPID Scoping Convention:
#   Session-scoped temp files MUST use $PPID (Claude Code parent PID), not $$.
#   Pattern: /tmp/.claude-{purpose}-${PPID}

input=$(cat)
if command -v jq >/dev/null 2>&1; then
  command_text=$(printf '%s\n' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
  command_text=$(INPUT_JSON="$input" python3 - <<'PY' 2>/dev/null
import json, os
try:
    data = json.loads(os.environ.get('INPUT_JSON', ''))
    print(data.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
PY
)
else
  command_text=""
fi

VIOLATION_FILE="/tmp/.claude-destructive-git-guard-${PPID}"
matched=""
ctx=""
# Optional `-C <path>` / `-c <k=v>` option pairs between `git` and the subcommand (L10).
GIT_PFX='(^|[;&|[:space:]])git([[:space:]]+(-C[[:space:]]+("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)|-c[[:space:]]+[^[:space:]]+))*[[:space:]]+'
add() { if [ -z "$ctx" ]; then ctx="$1"; else ctx="${ctx}"$'\n'"$1"; fi; }

if printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}reset[[:space:]]+--hard([[:space:]]|$)"; then
  matched="git reset --hard"
elif printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}clean[[:space:]]+([^;&|]*[[:space:]])?(-[A-Za-z]*f[A-Za-z]*|--force)([[:space:]]|$)"; then
  matched="git clean"
elif printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}restore([[:space:]]+--[^;&|[:space:]]+)*([[:space:]]+(\.|\*|/|--worktree|--staged))*([[:space:]]|$)"; then
  matched="git restore"
elif printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}checkout[[:space:]]+--[[:space:]]+(\.|\*|/)([[:space:]]|$)"; then
  matched="git checkout -- ."
elif printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}branch[[:space:]]+-D([[:space:]]|$)"; then
  matched="git branch -D"
fi

if [ -n "$matched" ]; then
  add "[Hook] DESTRUCTIVE GIT WARNING: detected '$matched' in Bash command"
  add "[Hook] Advisory only (R021): command is not blocked, but it may discard local work."
  add "[Hook] Before proceeding, verify git status and preserve work with git stash or a WIP commit."
  add "[Hook] Recovery: use 'git reflog' to find prior HEADs; for deleted branches, check 'git reflog --all'."

  if printf '%s\n' "$command_text" | grep -Eq "${GIT_PFX}branch[[:space:]]+-D([[:space:]]|$)"; then
    add "[Hook] Branch deletion note: prefer 'git branch -d' first so Git checks for unmerged commits."
  fi

  # State writes are silent and non-fatal (no stderr, no abort).
  { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$matched" >> "$VIOLATION_FILE"; } 2>/dev/null || true
  violation_count=$(wc -l < "$VIOLATION_FILE" 2>/dev/null | tr -d ' ')
  # Count line once per session: count >= 3 AND the atomic marker mkdir wins (parallel-safe).
  if [ "${violation_count:-0}" -ge 3 ] && { mkdir "/tmp/.claude-destructive-git-threshold-${PPID}"; } 2>/dev/null; then
    add "[Hook] Destructive git warnings: ${violation_count} this session (advisory telemetry; R021 promotion needs user approval)"
  fi
fi

# Emit advisory to the model (#1885); silent when nothing matched.
if [ -n "$ctx" ]; then
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  elif command -v python3 >/dev/null 2>&1; then
    CTX="$ctx" python3 -c 'import json,os; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":os.environ["CTX"]}}))'
  fi
fi
exit 0
