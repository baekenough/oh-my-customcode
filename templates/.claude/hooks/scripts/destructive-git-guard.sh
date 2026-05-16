#!/bin/bash
# R001/R021 destructive git guard hook
# Warns before commands that can discard working tree, untracked files, or branches.
# Advisory tier only: emits stderr guidance, records PPID-scoped warnings, exits 0.
#
# PPID Scoping Convention:
#   Session-scoped temp files MUST use $PPID (Claude Code parent PID), not $$.
#   Pattern: /tmp/.claude-{purpose}-${PPID}

input=$(cat)
if command -v jq >/dev/null 2>&1; then
  command_text=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
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

if printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+reset[[:space:]]+--hard([[:space:]]|$)'; then
  matched="git reset --hard"
elif printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+clean[[:space:]]+([^;&|]*[[:space:]])?-f(dx|xd|d|x)?([[:space:]]|$)'; then
  matched="git clean"
elif printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+restore([[:space:]]+--[^;&|[:space:]]+)*([[:space:]]+(\.|\*|/|--worktree|--staged))*([[:space:]]|$)'; then
  matched="git restore"
elif printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+checkout[[:space:]]+--[[:space:]]+(\.|\*|/)([[:space:]]|$)'; then
  matched="git checkout -- ."
elif printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+branch[[:space:]]+-D([[:space:]]|$)'; then
  matched="git branch -D"
fi

if [ -n "$matched" ]; then
  echo "[Hook] DESTRUCTIVE GIT WARNING: detected '$matched' in Bash command" >&2
  echo "[Hook] Advisory only (R021): command is not blocked, but it may discard local work." >&2
  echo "[Hook] Before proceeding, verify git status and preserve work with git stash or a WIP commit." >&2
  echo "[Hook] Recovery: use 'git reflog' to find prior HEADs; for deleted branches, check 'git reflog --all'." >&2

  if printf '%s\n' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+branch[[:space:]]+-D([[:space:]]|$)'; then
    echo "[Hook] Branch deletion note: prefer 'git branch -d' first so Git checks for unmerged commits." >&2
  fi

  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$matched" >> "$VIOLATION_FILE"
  violation_count=$(wc -l < "$VIOLATION_FILE" 2>/dev/null | tr -d ' ')
  if [ "${violation_count:-0}" -ge 3 ]; then
    echo "[Hook] Destructive git warnings: ${violation_count} this session — R021 promotion threshold reached" >&2
  fi
fi

# Always pass through - this hook is advisory only.
echo "$input"
