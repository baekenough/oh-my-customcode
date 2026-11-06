#!/bin/bash
# R001/R021 destructive git guard hook
# Warns before commands that can discard working tree, untracked files, or branches.
# Advisory tier only: emits guidance, records PPID-scoped warnings, exits 0.
# Channel (#1885): #1775 probe B measured CC 2.1.310, `claude -p`, haiku, bypassPermissions, project setting
# sources, one run, a PreToolUse Bash hook: exit-0 stderr did not reach the model, stdout JSON
# hookSpecificOutput.additionalContext did. Interactive sessions, other models and other versions were not
# measured. This guard delivers advice via stdout JSON hookSpecificOutput.additionalContext. No stdin passthrough, no stderr.
#
# PPID Scoping Convention:
#   Session-scoped temp files MUST use $PPID (Claude Code parent PID), not $$.
#   Pattern: /tmp/.claude-{purpose}-${PPID}

# Ignore SIGXFSZ: under `ulimit -f 0` the default action kills the shell (measured rc 153, advisory lost); ignored, a failed state write only returns EFBIG and the guard still exits 0.
trap '' XFSZ
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
add() { if [ -z "$ctx" ]; then ctx="$1"; else ctx="${ctx}"$'\n'"$1"; fi; }
# has <ERE>: does any line match? POSIX classes only (BSD/GNU differ on \b, \s). `>/dev/null`, not -q: -q stops at the first match and, with SIGPIPE ignored, printf then writes "write error" to stderr (bash 3.2.57, >64 KB).
has() { printf '%s\n' "$command_text" | grep -E "$1" >/dev/null; }
# kw <word>: cheap literal pre-filter (no grep spawn) - every pattern below needs its subcommand word.
kw() { case "$command_text" in *"$1"*) return 0 ;; esac; return 1; }

# Tier 1 (modelled forms). The `git` token may follow start-of-line, a shell separator, whitespace,
# `/` (path-qualified binary), `(` (subshell / `$(`), a backtick or a quote (`sh -c "git ..."`,
# `ssh host 'git ...'`); letters before it (xgit, legit) do not count. Between `git` and the subcommand: the global options GIT_OPT models (#1887 A2).
GIT_BOUND='(^|[;&|/(`"'"'"'[:space:]])'
GIT_VAL='("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)'
GIT_OPT="(-C[[:space:]]+${GIT_VAL}|-c[[:space:]]+${GIT_VAL}|--(git-dir|work-tree|namespace|super-prefix|config-env|attr-source)[[:space:]]+${GIT_VAL}|--[A-Za-z][-A-Za-z0-9]*(=${GIT_VAL})?|-[pP])"
GIT_PFX="${GIT_BOUND}git([[:space:]]+${GIT_OPT})*[[:space:]]+"
# Right edge of the last token: whitespace, end of line, a separator, `)` or a closing quote/backtick,
# so `(git reset --hard)`, `$(git clean -fd)` and `git reset --hard;` are seen.
GIT_END='([[:space:];&|)`"'"'"']|$)'

# Tier 2 (fail-closed, unmodelled forms): a boundary-delimited `git` token, the destructive
# subcommand word (optionally quoted) and its destructive flag later in the same simple command
# (no ; & | in between). Over-warning is acceptable for this advisory guard.
T2_EDGE='[[:space:]"'"'"']'
T2_QUOTE='["'"'"']?'
T2_HEAD="${GIT_BOUND}git[[:space:]]+([^;&|]*${T2_EDGE})?${T2_QUOTE}"
T2_GAP="${T2_QUOTE}[[:space:]]+([^;&|]*${T2_EDGE})?"
T2_END="$GIT_END"
# `restore` has no discriminating flag, so its tier-2 form is narrower: only option-like, $-expanded,
# quoted or backtick tokens may sit between `git` and `restore` (keeps `git commit -m "restore x"` silent).
T2_RESTORE="${GIT_BOUND}git([[:space:]]+[-\$\"'\`][^[:space:]]*)*[[:space:]]+${T2_QUOTE}restore${T2_QUOTE}${T2_END}"

# tier records which pass produced the match; it is written to the state line as a trailing ` tier=<1|2>`.
tier=1
# Pass 1: tier 1, original branch order and labels.
if kw reset && has "${GIT_PFX}reset[[:space:]]+--hard${GIT_END}"; then
  matched="git reset --hard"
elif kw clean && has "${GIT_PFX}clean[[:space:]]+([^;&|]*[[:space:]])?(-[A-Za-z]*f[A-Za-z]*|--force)${GIT_END}"; then
  matched="git clean"
elif kw restore && has "${GIT_PFX}restore([[:space:]]+--[^;&|[:space:]]+)*([[:space:]]+(\.|\*|/|--worktree|--staged))*${GIT_END}"; then
  matched="git restore"
elif kw checkout && has "${GIT_PFX}checkout[[:space:]]+--[[:space:]]+(\.|\*|/)${GIT_END}"; then
  matched="git checkout -- ."
elif kw branch && has "${GIT_PFX}branch[[:space:]]+-D${GIT_END}"; then
  matched="git branch -D"
fi

# Pass 2: tier 2, only when tier 1 found nothing and the text has a `git` token at all.
if [ -z "$matched" ] && kw git; then
  tier=2
  if kw reset && has "${T2_HEAD}reset${T2_GAP}--hard${T2_END}"; then
    matched="git reset --hard"
  elif kw clean && has "${T2_HEAD}clean${T2_GAP}(-[A-Za-z]*f[A-Za-z]*|--force)${T2_END}"; then
    matched="git clean"
  elif kw restore && has "$T2_RESTORE"; then
    matched="git restore"
  elif kw checkout && has "${T2_HEAD}checkout${T2_GAP}--[[:space:]]+(\.|\*|/)${T2_END}"; then
    matched="git checkout -- ."
  elif kw branch && has "${T2_HEAD}branch${T2_GAP}-D${T2_END}"; then
    matched="git branch -D"
  fi
fi

if [ -n "$matched" ]; then
  add "[Hook] DESTRUCTIVE GIT WARNING: detected '$matched' in Bash command"
  add "[Hook] Advisory only (R021): command is not blocked, but it may discard local work."
  add "[Hook] Before proceeding, verify git status and preserve work with git stash or a WIP commit."
  add "[Hook] Recovery: use 'git reflog' to find prior HEADs; for deleted branches, check 'git reflog --all'."

  if kw branch && { has "${GIT_PFX}branch[[:space:]]+-D${GIT_END}" || has "${T2_HEAD}branch${T2_GAP}-D${T2_END}"; }; then
    add "[Hook] Branch deletion note: prefer 'git branch -d' first so Git checks for unmerged commits."
  fi

  # State writes are silent and non-fatal (no stderr, no abort).
  { printf '%s %s tier=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$matched" "$tier" >> "$VIOLATION_FILE"; } 2>/dev/null || true
  # Count only lines NOT ending ` tier=2`: tier-1 lines and legacy untiered lines (written before the suffix existed) count; tier-2 warnings are still emitted and recorded but not counted.
  violation_count=$(grep -c -v ' tier=2$' "$VIOLATION_FILE" 2>/dev/null)
  # Sanitize to the first line, digits only, else 0: after a failed write (EFBIG) the shell's unflushed printf buffer can leak into the substitution and make `[` print "integer expression expected".
  violation_count=${violation_count%%$'\n'*}
  case "$violation_count" in ''|*[!0-9]*) violation_count=0 ;; esac
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
