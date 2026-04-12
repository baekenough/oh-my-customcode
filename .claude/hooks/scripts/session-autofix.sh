#!/bin/bash
# Session Auto-Fix — SessionStart command hook (#838)
# Detects previous session issues: uncommitted changes, template sync,
# CLAUDE.md counts, gitignore blocking, wiki staleness, broken skill refs.
# Protocol: stdin JSON -> stdout pass-through, exit 0 always
# Time budget: <3s

input=$(cat)
FIXES_FILE="/tmp/.claude-session-fixes-${PPID}"
LOG_DIR=".claude/outputs/session-fixes"
ISSUES=()
FIXES=()
ISSUE_COUNT=0
FIX_COUNT=0

# Utility: add issue
add_issue() {
  ISSUES+=("$1")
  ISSUE_COUNT=$((ISSUE_COUNT + 1))
}

add_fix() {
  FIXES+=("$1")
  FIX_COUNT=$((FIX_COUNT + 1))
}

# ─── Check 1: Uncommitted changes ───
uncommitted=$(git status --porcelain 2>/dev/null | head -20)
if [ -n "$uncommitted" ]; then
  count=$(echo "$uncommitted" | wc -l | tr -d ' ')
  add_issue "uncommitted:${count} uncommitted changes detected"
fi

# ─── Check 2: Template sync (lightweight count comparison) ───
if [ -d "templates/.claude/agents" ] && [ -d ".claude/agents" ]; then
  src_agents=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
  tpl_agents=$(ls templates/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$src_agents" != "$tpl_agents" ]; then
    add_issue "template-sync:Agent count mismatch (source:${src_agents} vs template:${tpl_agents})"
  fi

  src_skills=$(find .claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
  tpl_skills=$(find templates/.claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$src_skills" != "$tpl_skills" ]; then
    add_issue "template-sync:Skill count mismatch (source:${src_skills} vs template:${tpl_skills})"
  fi

  src_rules=$(ls .claude/rules/*.md 2>/dev/null | wc -l | tr -d ' ')
  tpl_rules=$(ls templates/.claude/rules/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$src_rules" != "$tpl_rules" ]; then
    add_issue "template-sync:Rule count mismatch (source:${src_rules} vs template:${tpl_rules})"
  fi

  src_guides=$(find guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  tpl_guides=$(find templates/guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  if [ "$src_guides" != "$tpl_guides" ]; then
    add_issue "template-sync:Guide count mismatch (source:${src_guides} vs template:${tpl_guides})"
  fi
fi

# ─── Check 3: CLAUDE.md count validation ───
if [ -f "CLAUDE.md" ]; then
  actual_agents=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
  doc_agents=$(grep -oE '[0-9]+ 파일\)' CLAUDE.md | head -1 | grep -oE '[0-9]+' || echo "0")
  if [ "$actual_agents" != "$doc_agents" ] && [ "$doc_agents" != "0" ]; then
    add_issue "claude-md:Agent count in CLAUDE.md ($doc_agents) != actual ($actual_agents)"
  fi
fi

# ─── Check 4: Gitignore blocking new .claude/ files ───
new_files=$(git ls-files --others --exclude-standard .claude/ 2>/dev/null | head -5)
ignored_new=""
if [ -n "$new_files" ]; then
  while IFS= read -r f; do
    if git check-ignore --quiet "$f" 2>/dev/null; then
      ignored_new="${ignored_new}${f}\n"
    fi
  done <<< "$new_files"
fi
if [ -n "$ignored_new" ]; then
  add_issue "gitignore:New .claude/ files blocked by .gitignore"
fi

# ─── Check 5: Wiki staleness (lightweight) ───
if [ -d "wiki" ]; then
  missing_wiki=0
  for agent in .claude/agents/*.md; do
    name=$(basename "$agent" .md)
    if [ ! -f "wiki/agents/${name}.md" ]; then
      missing_wiki=$((missing_wiki + 1))
    fi
  done
  if [ "$missing_wiki" -gt 0 ]; then
    add_issue "wiki-stale:${missing_wiki} agent(s) missing wiki pages"
  fi
fi

# ─── Check 6: Broken skill references (lightweight) ───
broken_refs=0
for agent in .claude/agents/*.md; do
  skills_line=$(grep -E '^skills:' "$agent" 2>/dev/null | head -1)
  if [ -n "$skills_line" ]; then
    skills=$(echo "$skills_line" | sed 's/skills: *\[//;s/\]//;s/,/ /g;s/"//g' | tr -d "'")
    for skill in $skills; do
      skill=$(echo "$skill" | tr -d ' ')
      if [ -n "$skill" ] && [ ! -f ".claude/skills/${skill}/SKILL.md" ]; then
        broken_refs=$((broken_refs + 1))
      fi
    done
  fi
done
if [ "$broken_refs" -gt 0 ]; then
  add_issue "broken-refs:${broken_refs} broken skill reference(s) in agent frontmatter"
fi

# ─── Report ───
if [ "$ISSUE_COUNT" -gt 0 ]; then
  echo "[Session Auto-Fix] ${ISSUE_COUNT} issue(s) detected:" >&2
  for issue in "${ISSUES[@]}"; do
    type="${issue%%:*}"
    msg="${issue#*:}"
    echo "  ⚠ [${type}] ${msg}" >&2
  done
  if [ "$FIX_COUNT" -gt 0 ]; then
    echo "[Session Auto-Fix] Auto-fixed ${FIX_COUNT} item(s):" >&2
    for fix in "${FIXES[@]}"; do
      echo "  ✓ ${fix}" >&2
    done
  fi
fi

# ─── Write findings for prompt hook ───
if command -v jq >/dev/null 2>&1; then
  issues_json=$(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .)
  fixes_json=$(printf '%s\n' "${FIXES[@]}" | jq -R . | jq -s .)
  echo "{\"issue_count\":${ISSUE_COUNT},\"fix_count\":${FIX_COUNT},\"issues\":${issues_json},\"fixes\":${fixes_json}}" > "$FIXES_FILE"
else
  echo "{\"issue_count\":${ISSUE_COUNT},\"fix_count\":${FIX_COUNT}}" > "$FIXES_FILE"
fi

# ─── JSONL log ───
mkdir -p "$LOG_DIR" 2>/dev/null
echo "{\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"issue_count\":${ISSUE_COUNT},\"fix_count\":${FIX_COUNT}}" >> "${LOG_DIR}/$(date +%Y-%m-%d).jsonl" 2>/dev/null

echo "$input"
exit 0
