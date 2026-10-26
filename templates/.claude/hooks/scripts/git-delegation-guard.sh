#!/bin/bash
# git-delegation-guard.sh — PreToolUse(Task|Agent): R010 git 위임 감지 (advisory, #1885)
#
# Warns when a delegation prompt to a non-mgr-gitnerd agent mentions git write keywords.
# Advisory only: always exit 0, never blocks, never modifies tool input.
#
# Delivery (#1885): exit 0 + stderr never reaches the model (measured, #1775 comment
#   6405197553). The warning is therefore emitted as ONE stdout JSON line
#   hookSpecificOutput.additionalContext; nothing is written to stderr and the input is
#   no longer echoed back. No warning -> no output.
#
# Precision (#1885): a keyword occurrence does NOT count when (case-insensitive, LC_ALL=C bytes;
#   U+2019 is folded to `'`; `git -C <path>` / `git -c k=v` option groups are stripped first so
#   `git -C /repo commit` is treated like `git commit`):
#   (a) a negation token appears BEFORE it on the same line. English tokens are whole words
#       (`-` and `_` stay inside words, so `--no-rebase`, `no-op`, `not_found` do not count):
#       not, never, no, don't, avoid, without, forbidden, prohibited (so "do not" is covered);
#       Korean substrings 금지, 말 것, 하지 마 (bare "않" was removed: too broad);
#   (b) it sits in a prohibition block. Header words (word-bounded, after list/markdown markers):
#       Forbidden, Prohibited, Do not, Don't, Never, Avoid, 금지, 하지 말 것.
#       - colon header: a line starting with a header word whose `:` or full-width `：` ends the
#         header phrase (at most 4 words before it). The block runs to the next blank line
#         or the next non-prohibition label line (`Allowed: …`, `Steps:`, `**Steps**:`); a
#         prohibition label (`Never: …`) continues it.
#       - markdown heading (`#`..`######` + space; `#1885` is not a heading) starting with a header
#         word (colon optional). The block covers only the FIRST paragraph or list after the
#         heading: blank lines directly after the heading are skipped, then it runs through
#         consecutive non-blank lines and ends at the next blank line, heading, or label line
#         (`**Bold**` or a non-list line ending in a colon);
#       - header colons count only when followed by whitespace/end of line (`https://x`, `10:30`
#         do not); Korean header words need a boundary (whitespace, colon or end: `금지어` is not
#         a header). Lines inside ``` fences never open or close blocks (fence lines themselves
#         count as block content);
#   (c) it is a read-only query:
#       - `git branch` followed by --list, -l, --show-current, --contains, --all, --merged,
#         --no-merged, -a, -r, -v or -vv, unless the same command also has -d/-D/--delete/-m/-M/
#         -c/-C (`git branch -r -d origin/x` is a write and fires);
#       - `git tag` followed by --list, -l, --contains, --points-at or --sort;
#       - bare `git tag` / `git branch` used as a noun: followed by end of line, punctuation, `+`,
#         a backtick, an opening bracket, or whitespace + a common prose word (is/the/and/...).
#         `git branch feature-x` / `git tag v1` are creations and still fire.
#   Keyword boundary: a keyword matches only if the next char is not [A-Za-z0-9_-] and the
#   previous char is not [A-Za-z0-9_] (`git merge-base` does not match `git merge`; "legit
#   commit" does not match `git commit`). Quoted `-C "/my repo"` / `-c 'k=v w'` arguments with
#   spaces are stripped like unquoted ones.
#   Warn only if at least one occurrence survives. The keyword set and the mgr-gitnerd
#   exemption are unchanged. A non-string prompt is treated as empty; a missing subagent_type
#   is shown as (unspecified).
#
# Measured precision: replay (8 newest main transcripts, dedup by tool_use id; subagent
#   transcripts carry no Agent calls): old 167 -> 23 of 752 inputs; 0 clear true positives found
#   in this repo's corpus. The hook stays model-visible (additionalContext, worded as a
#   conditional advisory) because the base rate in installed projects differs [가설].
#
# Known false negatives (accepted trade-offs):
#   - a real command after a negation word on the same line ("Do not skip this: git commit now"
#     is read as a colon header and skipped with its block);
#   - a real command inside a prohibition block not separated by a blank line (colon header) or
#     placed in the first paragraph/list under a Forbidden heading;
#   - prose "git tag"/"git branch" followed by a stop-listed word is treated as a noun.
#   Known false positive (SOV trade-off): Korean "git commit 금지" (token after the keyword) is
#   NOT excluded by (a) unless it sits in a block (b), so it still warns.
#
# State writes (violation file, threshold marker) are best-effort: failures are silent and never
#   abort or leak to stderr. The per-session count line is emitted once, when the count is >= 3
#   and the atomic marker dir /tmp/.claude-r010-threshold-${PPID} is created by this firing.
#
# PPID Scoping Convention:
#   All session-scoped temp files MUST use $PPID (Claude Code parent PID),
#   NOT $$ (subprocess PID which changes per hook invocation).
#   Pattern: /tmp/.claude-{purpose}-${PPID}
#   See also: agent-teams-advisor.sh, context-budget-advisor.sh, stuck-detector.sh

# Dependency check: exit silently if jq not available
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Guard: non-object stdin (non-JSON / JSON array / empty) — swallow and exit 0. (#1656 F)
printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0

# `?` suppresses jq errors when tool_input is a scalar/array (#1656 A).
agent_type=$(printf '%s\n' "$input" | jq -r '(.tool_input.subagent_type? | strings) // ""' 2>/dev/null || echo "")
prompt=$(printf '%s\n' "$input" | jq -r '(.tool_input.prompt? | strings) // ""' 2>/dev/null || echo "")

# R010 violation tracking file (PPID-scoped for session persistence)
VIOLATION_FILE="/tmp/.claude-r010-violations-${PPID}"

ctx=""

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
  kw_list=$(IFS='|'; printf '%s' "${git_keywords[*]}")

  # First keyword (in list order) with at least one surviving occurrence.
  keyword=$(printf '%s\n' "$prompt" | LC_ALL=C awk -v kws="$kw_list" '
    function hw(x) {
      return (x ~ /^(forbidden|prohibited|do not|don.t|never|avoid)([^a-z0-9_]|$)/ || x ~ /^(금지|하지 말 것)([ \t:]|$|\357\274\232)/)
    }
    # header colon: ":" or full-width "：" followed by whitespace/end of line, at most 4 words before it
    function colon_header(x,   i, len, ch, pre, k, tmp) {
      len = length(x)
      for (i = 1; i <= len; i++) {
        ch = substr(x, i, 1)
        if (ch == ":" && (i == len || substr(x, i + 1, 1) ~ /[ \t]/)) break
        if (substr(x, i, 3) == "\357\274\232" && (i + 2 == len || substr(x, i + 3, 1) ~ /[ \t]/)) break
      }
      if (i > len) return 0
      pre = substr(x, 1, i - 1)
      k = split(pre, tmp, /[ \t]+/)
      return (k <= 4)
    }
    BEGIN {
      n = split(kws, K, "|")
      inblock = 0; btype = ""; hstate = ""; infence = 0
      neg = " (not|never|no|don.t|avoid|without|forbidden|prohibited) "
      prose = "(is|was|are|and|or|the|a|an|to|of|in|on|at|for|with|before|after|then|that|which|when|if|as|from|by|name|names|first|output|result|state|you|we|it)"
    }
    {
      l = tolower($0)
      gsub(/\342\200\231/, "\047", l)
      gsub(/git[ \t]+(-[cC][ \t]+([\"][^\"]*[\"]|\047[^\047]*\047|[^ \t]+)[ \t]+)+/, "git ", l)
      isfence = (l ~ /^[ \t]*```/)
      if (isfence) infence = !infence
      if (l ~ /^[ \t\r]*$/) {
        if (inblock && !infence) {
          if (btype == "C") inblock = 0
          else if (hstate == "body") inblock = 0
        }
        next
      }
      s = l
      sub(/^[ \t>*#+_`-]+/, "", s)
      sub(/^[0-9]+[.)][ \t]+/, "", s)
      sub(/^[*_`]+/, "", s)
      if (!isfence && !infence) {
        if (l ~ /^[ \t]*(#|##|###|####|#####|######)[ \t]/) {
          # heading: ends any block; a prohibition heading opens an H block (first paragraph/list only)
          if (hw(s)) { inblock = 1; btype = "H"; hstate = "lead"; next }
          inblock = 0; btype = ""
        } else {
          # a NEW colon-header line that is not itself a prohibition header ends a colon block
          if (inblock && btype == "C" && colon_header(s) && !hw(s)) { inblock = 0; btype = "" }
          # a label line (**Bold** or "text:") ends an H block
          if (inblock && btype == "H" && (l ~ /^[ \t]*\*\*[^*]+\*\*[ \t]*[:：]?[ \t]*$/ || (l !~ /^[ \t]*([-*+]|[0-9]+[.)])[ \t]/ && l ~ /(:|\357\274\232)[ \t]*$/))) { inblock = 0; btype = "" }
          if (!inblock && hw(s) && colon_header(s)) { inblock = 1; btype = "C"; next }
        }
      }
      if (inblock) { if (btype == "H") hstate = "body"; next }
      for (i = 1; i <= n; i++) {
        kw = K[i]
        if (kw in surv) continue
        off = 0
        rest = l
        while ((p = index(rest, kw)) > 0) {
          pos = off + p
          pre = substr(l, 1, pos - 1)
          post = substr(l, pos + length(kw))
          rest = substr(l, pos + 1)
          off = pos
          if (post ~ /^[a-z0-9_-]/) continue
          if (pos > 1 && substr(l, pos - 1, 1) ~ /[a-z0-9_]/) continue
          w = pre
          gsub(/[^a-z0-9\047_-]/, " ", w)
          w = " " w " "
          if (w ~ neg) continue
          if (index(pre, "금지") || index(pre, "말 것") || index(pre, "하지 마")) continue
          if (kw == "git branch" || kw == "git tag") {
            cmd = post
            sub(/[;&|].*$/, "", cmd)
            if (kw == "git branch" && cmd ~ /(^|[ \t])(--delete|-[a-z]*[dmc][a-z]*)([ \t]|$)/) { surv[kw] = 1; break }
            if (kw == "git branch" && post ~ /^[ \t]+(--list|-l|--show-current|--contains|--all|--merged|--no-merged|-a|-r|-v|-vv)([^a-z0-9-]|$)/) continue
            if (kw == "git tag" && post ~ /^[ \t]+(--list|-l|--contains|--points-at|--sort)([^a-z0-9-]|$)/) continue
            if (post ~ /^[ \t]*$/ || post ~ /^[+`.,;:)\]\047"!?|\/]/ || post ~ /^[ \t]+[(\[]/ || post ~ ("^[ \t]+" prose "([^a-z0-9_-]|$)")) continue
          }
          surv[kw] = 1
          break
        }
      }
    }
    END {
      for (i = 1; i <= n; i++) if (K[i] in surv) { print K[i]; exit }
    }
  ')

  if [ -n "$keyword" ]; then
    if [ -n "$agent_type" ]; then shown="'$agent_type'"; else shown="(unspecified)"; fi
    ctx="[Hook] ADVISORY: delegation prompt to $shown mentions '$keyword' — if this delegates a git operation, route it to mgr-gitnerd (R010)."
    ctx="$ctx"$'\n'"[Hook] Per R010, all git operations (commit/push/branch/merge/etc.) MUST be delegated to mgr-gitnerd"

    # Record mention for R021 promotion tracking (best-effort, silent on failure)
    { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $keyword ${agent_type:-(unspecified)}" >> "$VIOLATION_FILE"; } 2>/dev/null || true
    violation_count=$({ wc -l < "$VIOLATION_FILE" | tr -d ' '; } 2>/dev/null || true)
    # Count line once: count >= 3 AND the atomic marker dir is created by this firing.
    if [ "${violation_count:-0}" -ge 3 ] 2>/dev/null && { mkdir "/tmp/.claude-r010-threshold-${PPID}"; } 2>/dev/null; then
      ctx="$ctx"$'\n'"[Hook] R010 git-keyword mentions: ${violation_count} this session (advisory telemetry; R021 promotion needs user approval)"
    fi
  fi
fi

if [ -n "$ctx" ]; then
  jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
fi

exit 0
