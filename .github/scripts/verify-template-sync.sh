#!/usr/bin/env bash
# verify-template-sync.sh — mirrors template-sync job of ci.yml
# Accumulates all errors before exiting. Idempotent, read-only.
# Works on macOS and Linux.
set -euo pipefail

errors=0

# ── Skill count ──────────────────────────────────────────────────────────────
src_skills=$(find .claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
tpl_skills=$(find templates/.claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$src_skills" != "$tpl_skills" ]; then
  echo "ERROR: Skill count mismatch: .claude/skills=$src_skills, templates/.claude/skills=$tpl_skills"
  # List differing skill names (portable: no process substitution with diff)
  src_skill_names=$(find .claude/skills -name "SKILL.md" -exec dirname {} \; | xargs -I{} basename {} 2>/dev/null | sort)
  tpl_skill_names=$(find templates/.claude/skills -name "SKILL.md" -exec dirname {} \; | xargs -I{} basename {} 2>/dev/null | sort)
  # Print names only in src (missing from template)
  while IFS= read -r sname; do
    case "$tpl_skill_names" in
      *"$sname"*) ;;
      *) echo "  < only in .claude/skills: $sname" ;;
    esac
  done <<EOF
$src_skill_names
EOF
  # Print names only in template (extra in template)
  while IFS= read -r tname; do
    case "$src_skill_names" in
      *"$tname"*) ;;
      *) echo "  > only in templates/.claude/skills: $tname" ;;
    esac
  done <<EOF
$tpl_skill_names
EOF
  errors=$((errors + 1))
fi

# ── Hook script count ────────────────────────────────────────────────────────
src_hooks=0
for f in .claude/hooks/scripts/*.sh; do [ -e "$f" ] && src_hooks=$((src_hooks + 1)); done
tpl_hooks=0
for f in templates/.claude/hooks/scripts/*.sh; do [ -e "$f" ] && tpl_hooks=$((tpl_hooks + 1)); done
if [ "$src_hooks" != "$tpl_hooks" ]; then
  echo "ERROR: Hook script count mismatch: .claude/hooks/scripts=$src_hooks, templates/.claude/hooks/scripts=$tpl_hooks"
  errors=$((errors + 1))
fi

# ── hooks.json matcher count ─────────────────────────────────────────────────
src_hook_entries=0
tpl_hook_entries=0
if [ -f ".claude/hooks/hooks.json" ]; then
  src_hook_entries=$(grep -c '"matcher"' .claude/hooks/hooks.json 2>/dev/null || echo 0)
fi
if [ -f "templates/.claude/hooks/hooks.json" ]; then
  tpl_hook_entries=$(grep -c '"matcher"' templates/.claude/hooks/hooks.json 2>/dev/null || echo 0)
fi
if [ "$src_hook_entries" != "$tpl_hook_entries" ]; then
  echo "ERROR: hooks.json matcher count mismatch: .claude=$src_hook_entries, templates=$tpl_hook_entries"
  errors=$((errors + 1))
fi

# ── Schema count ─────────────────────────────────────────────────────────────
if [ -d ".claude/schemas" ]; then
  src_schemas=0
  for f in .claude/schemas/*.json; do [ -e "$f" ] && src_schemas=$((src_schemas + 1)); done
  tpl_schemas=0
  for f in templates/.claude/schemas/*.json; do [ -e "$f" ] && tpl_schemas=$((tpl_schemas + 1)); done
  if [ "$src_schemas" != "$tpl_schemas" ]; then
    echo "ERROR: Schema count mismatch: .claude/schemas=$src_schemas, templates/.claude/schemas=$tpl_schemas"
    errors=$((errors + 1))
  fi
fi

# ── Skill script files ───────────────────────────────────────────────────────
SCRIPT_ERRORS=0
for script_dir in .claude/skills/*/scripts; do
  if [ -d "$script_dir" ]; then
    skill_name=$(basename "$(dirname "$script_dir")")
    template_dir="templates/.claude/skills/$skill_name/scripts"
    if [ ! -d "$template_dir" ]; then
      echo "ERROR: Missing template scripts dir: $template_dir"
      SCRIPT_ERRORS=$((SCRIPT_ERRORS + 1))
    else
      for script in "$script_dir"/*; do
        [ -e "$script" ] || continue
        script_name=$(basename "$script")
        if [ ! -f "$template_dir/$script_name" ]; then
          echo "ERROR: Missing template script: $template_dir/$script_name"
          SCRIPT_ERRORS=$((SCRIPT_ERRORS + 1))
        fi
      done
    fi
  fi
done
errors=$((errors + SCRIPT_ERRORS))

# ── Agent count ──────────────────────────────────────────────────────────────
src_agent_count=0
for f in .claude/agents/*.md; do [ -e "$f" ] && src_agent_count=$((src_agent_count + 1)); done
tpl_agent_count=0
for f in templates/.claude/agents/*.md; do [ -e "$f" ] && tpl_agent_count=$((tpl_agent_count + 1)); done
if [ "$src_agent_count" != "$tpl_agent_count" ]; then
  echo "ERROR: Agent count mismatch: source=$src_agent_count template=$tpl_agent_count"
  errors=$((errors + 1))
fi

# ── Rules count ──────────────────────────────────────────────────────────────
src_rules_count=0
for f in .claude/rules/*.md; do [ -e "$f" ] && src_rules_count=$((src_rules_count + 1)); done
tpl_rules_count=0
for f in templates/.claude/rules/*.md; do [ -e "$f" ] && tpl_rules_count=$((tpl_rules_count + 1)); done
if [ "$src_rules_count" != "$tpl_rules_count" ]; then
  echo "ERROR: Rules count mismatch: source=$src_rules_count template=$tpl_rules_count"
  errors=$((errors + 1))
fi

# ── Guides count ─────────────────────────────────────────────────────────────
src_guides_count=$(find guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
tpl_guides_count=$(find templates/guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
if [ "$src_guides_count" != "$tpl_guides_count" ]; then
  echo "ERROR: Guides count mismatch: source=$src_guides_count template=$tpl_guides_count"
  errors=$((errors + 1))
fi

# ── Manifest guides count consistency ────────────────────────────────────────
echo ""
echo "=== Manifest Guides Count Consistency ==="
if ! command -v jq >/dev/null 2>&1; then
  echo "::warning::jq not installed — manifest count verification skipped"
  echo "Install: apt-get install jq | brew install jq"
else
  MANIFEST_GUIDES=$(jq '.components[] | select(.name == "guides") | .files' templates/manifest.json 2>/dev/null)
  if [ -z "$MANIFEST_GUIDES" ] || [ "$MANIFEST_GUIDES" = "null" ]; then
    echo "::warning::templates/manifest.json has no components[name=guides].files entry"
  else
    ACTUAL_GUIDES=$(find guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    if [ "$MANIFEST_GUIDES" != "$ACTUAL_GUIDES" ]; then
      echo "::error::templates/manifest.json guides count drift:"
      echo "  manifest.json: $MANIFEST_GUIDES"
      echo "  actual guides/*/: $ACTUAL_GUIDES"
      echo ""
      echo "Run: jq '(.components[] | select(.name == \"guides\") | .files) = $ACTUAL_GUIDES' templates/manifest.json > templates/manifest.json.tmp && mv templates/manifest.json.tmp templates/manifest.json"
      errors=$((errors + 1))
    else
      echo "[OK] manifest.json guides count: $ACTUAL_GUIDES"
    fi
  fi
fi

# ── CLAUDE.md agent and skill counts ─────────────────────────────────────────
actual_agents=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
actual_skills=$(find .claude/skills -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')

# Extract counts from CLAUDE.md — pattern: "(48 파일)" or "(106 디렉토리)"
doc_agents=$(grep -oE 'agents/[^(]*\(([0-9]+) 파일\)' CLAUDE.md 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
doc_skills=$(grep -oE 'skills/[^(]*\(([0-9]+) 디렉토리\)' CLAUDE.md 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

echo "Actual: agents=$actual_agents skills=$actual_skills rules=$src_rules_count guides=$src_guides_count"
echo "CLAUDE.md documented: agents=$doc_agents skills=$doc_skills"

if [ "$doc_agents" != "0" ] && [ "$actual_agents" != "$doc_agents" ]; then
  echo "WARNING: CLAUDE.md agent count ($doc_agents) != actual ($actual_agents)"
  errors=$((errors + 1))
fi
if [ "$doc_skills" != "0" ] && [ "$actual_skills" != "$doc_skills" ]; then
  echo "WARNING: CLAUDE.md skill count ($doc_skills) != actual ($actual_skills)"
  errors=$((errors + 1))
fi

# ── Final result ─────────────────────────────────────────────────────────────
if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Fix: copy missing files from .claude/ to templates/.claude/"
  echo "Example: cp .claude/skills/NEW_SKILL/SKILL.md templates/.claude/skills/NEW_SKILL/SKILL.md"
  exit 1
fi

echo "Template sync verified: $src_skills skills, $src_hooks hooks, $src_hook_entries hook matchers, skill scripts OK"
echo "Agents: $src_agent_count  Rules: $src_rules_count  Guides: $src_guides_count"
