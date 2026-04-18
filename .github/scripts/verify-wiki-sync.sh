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
