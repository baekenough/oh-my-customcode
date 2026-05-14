#!/usr/bin/env bash
# verify-wiki-sync.sh — mirrors "Check for missing wiki pages" step of wiki-sync.yml
# Idempotent, read-only. Exits 1 on any missing page.
# Works on macOS and Linux.
set -euo pipefail

ERRORS=0
MISSING=0

# ── Guard: wiki/ directory must exist ────────────────────────────────────────
if [ ! -d "wiki" ]; then
  echo "ERROR: wiki/ directory not found. Run '/omcustom:wiki' first."
  exit 1
fi

# ── Agents ───────────────────────────────────────────────────────────────────
src_agents=0
for src in .claude/agents/*.md; do
  [ -e "$src" ] || continue
  src_agents=$((src_agents + 1))
  name=$(basename "$src" .md)
  wiki_page="wiki/agents/${name}.md"
  if [ ! -f "$wiki_page" ]; then
    echo "MISSING: $wiki_page  (source: $src)"
    MISSING=$((MISSING + 1))
    ERRORS=$((ERRORS + 1))
  fi
done

# ── Skills ───────────────────────────────────────────────────────────────────
src_skills=0
while IFS= read -r src; do
  src_skills=$((src_skills + 1))
  skill_dir=$(dirname "$src")
  name=$(basename "$skill_dir")
  wiki_page="wiki/skills/${name}.md"
  if [ ! -f "$wiki_page" ]; then
    echo "MISSING: $wiki_page  (source: $src)"
    MISSING=$((MISSING + 1))
    ERRORS=$((ERRORS + 1))
  fi
done < <(find .claude/skills -name "SKILL.md" 2>/dev/null)

# ── Rules ────────────────────────────────────────────────────────────────────
src_rules=0
for src in .claude/rules/*.md; do
  [ -e "$src" ] || continue
  src_rules=$((src_rules + 1))
  # Extract numeric part of rule ID (e.g. "ID**: R007" → "7")
  rule_id=$(grep -oE 'ID\*\*: R[0-9]+' "$src" 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)
  if [ -n "$rule_id" ]; then
    wiki_page="wiki/rules/r$(printf '%03d' "$((10#$rule_id))").md"
    if [ ! -f "$wiki_page" ]; then
      echo "MISSING: $wiki_page  (source: $src)"
      MISSING=$((MISSING + 1))
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# ── Guides ───────────────────────────────────────────────────────────────────
src_guides=0
while IFS= read -r src; do
  src_guides=$((src_guides + 1))
  name=$(basename "$src")
  wiki_page="wiki/guides/${name}.md"
  if [ ! -f "$wiki_page" ]; then
    echo "MISSING: $wiki_page  (source: $src)"
    MISSING=$((MISSING + 1))
    ERRORS=$((ERRORS + 1))
  fi
done < <(find guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null)

# ── wiki/index.yaml ──────────────────────────────────────────────────────────
if [ ! -f "wiki/index.yaml" ]; then
  echo "MISSING: wiki/index.yaml"
  ERRORS=$((ERRORS + 1))
fi

# ── Summary ──────────────────────────────────────────────────────────────────
total_wiki=$(find wiki -name "*.md" ! -name "index.md" ! -name "log.md" 2>/dev/null | wc -l | tr -d ' ')
echo "Source entities: agents=$src_agents skills=$src_skills rules=$src_rules guides=$src_guides"
echo "Wiki pages (total .md): $total_wiki  |  Missing: $MISSING"

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Fix: run '/omcustom:wiki' to regenerate wiki pages"
  exit 1
fi

echo "Wiki sync check passed"

# ── Count Consistency Check ──────────────────────────────────────────────────
echo ""
echo "=== Wiki Index Count Consistency ==="

INDEX_YAML="wiki/index.yaml"

if [ ! -f "$INDEX_YAML" ]; then
  echo "SKIP: wiki/index.yaml not found — count consistency check skipped"
else
  # Parse index.yaml using grep/awk (no yq dependency)
  INDEX_TOTAL=$( { grep -E '^  total_pages:' "$INDEX_YAML" || true; } | sed 's/.*total_pages: *//' | tr -d ' ')
  INDEX_SKILLS=$( { awk '/^  counts:/,/^[a-z]/' "$INDEX_YAML" || true; } | { grep -E '^ +skills:' || true; } | sed 's/.*skills: *//' | tr -d ' ')
  INDEX_AGENTS=$( { awk '/^  counts:/,/^[a-z]/' "$INDEX_YAML" || true; } | { grep -E '^ +agents:' || true; } | sed 's/.*agents: *//' | tr -d ' ')
  INDEX_RULES=$( { awk '/^  counts:/,/^[a-z]/' "$INDEX_YAML" || true; } | { grep -E '^ +rules:' || true; } | sed 's/.*rules: *//' | tr -d ' ')
  INDEX_GUIDES=$( { awk '/^  counts:/,/^[a-z]/' "$INDEX_YAML" || true; } | { grep -E '^ +guides:' || true; } | sed 's/.*guides: *//' | tr -d ' ')

  # Actual counts (all .md files in wiki/)
  ACTUAL_TOTAL=$(find wiki -name '*.md' -type f | wc -l | tr -d ' ')
  ACTUAL_SKILLS=$(find wiki/skills -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
  ACTUAL_AGENTS=$(find wiki/agents -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
  ACTUAL_RULES=$(find wiki/rules -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
  ACTUAL_GUIDES=$(find wiki/guides -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')

  COUNT_ERRORS=0

  # total_pages check
  if [ -n "$INDEX_TOTAL" ] && [ "$INDEX_TOTAL" != "$ACTUAL_TOTAL" ]; then
    echo "::error::wiki/index.yaml total_pages drift:"
    echo "  index.yaml: $INDEX_TOTAL"
    echo "  actual:     $ACTUAL_TOTAL"
    COUNT_ERRORS=$((COUNT_ERRORS + 1))
  else
    echo "[OK] total_pages: $ACTUAL_TOTAL"
  fi

  # Per-category checks
  check_count() {
    local cat="$1" index_val="$2" actual_val="$3"
    if [ -n "$index_val" ] && [ "$index_val" != "$actual_val" ]; then
      echo "::error::wiki/index.yaml counts.$cat drift:"
      echo "  index.yaml: $index_val"
      echo "  actual:     $actual_val"
      COUNT_ERRORS=$((COUNT_ERRORS + 1))
    elif [ -n "$index_val" ]; then
      echo "[OK] counts.$cat: $actual_val"
    else
      echo "[SKIP] counts.$cat: key not present in index.yaml"
    fi
  }

  check_count "skills" "$INDEX_SKILLS" "$ACTUAL_SKILLS"
  check_count "agents" "$INDEX_AGENTS" "$ACTUAL_AGENTS"
  check_count "rules"  "$INDEX_RULES"  "$ACTUAL_RULES"
  check_count "guides" "$INDEX_GUIDES" "$ACTUAL_GUIDES"

  if [ "$COUNT_ERRORS" -gt 0 ]; then
    echo ""
    echo "Fix: run wiki-curator or '/omcustom:wiki' to regenerate index.yaml"
    exit 1
  fi
fi
