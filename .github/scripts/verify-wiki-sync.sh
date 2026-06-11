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

  # Actual counts
  # total_pages counts indexed content pages only (navigation/landing pages at wiki/ root excluded, per #1223)
  ACTUAL_TOTAL=$(find wiki -mindepth 2 -name '*.md' -type f | wc -l | tr -d ' ')
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

# ── Content-Drift Check (Phase B — BLOCKING on genuine drift) ────────────────
# #1325 Phase A → #1330 Phase B: detect SOURCE body changes that leave a wiki page
# stale even when no page is added/removed and counts are unchanged. Compares current
# source hashes against the wiki/.source-hashes.json manifest (recorded at last sync).
#
# Phase B (R021 hard-block promotion, #1330): GENUINE content drift
# (STALE wiki page / NEW source not in manifest / ORPHAN deleted source) now FAILS
# the build (exit 1). INFRASTRUCTURE-MISSING cases (helper not found, manifest absent,
# jq unavailable, corrupt manifest, hash-generation failure, helper-source failure)
# remain advisory ::warning:: + non-failing — those mean the check is UNAVAILABLE
# (graceful degradation), not that drift was found. Only real drift blocks.
echo ""
echo "=== Wiki Content-Drift Check (Phase B — blocking) ==="

MANIFEST="wiki/.source-hashes.json"
HELPER_LIB=""
for cand in \
  "$(dirname "$0")/lib/source-hash.sh" \
  ".github/scripts/lib/source-hash.sh"; do
  if [ -f "$cand" ]; then HELPER_LIB="$cand"; break; fi
done

# DRIFT_MARKER: a sentinel file the guarded subshell touches ONLY when GENUINE
# content drift is found. The subshell swallows non-zero status (set -e inside the
# helper must not abort the parent), so we cannot exit 1 from within it directly.
# After the subshell, if the marker exists, the parent fails the build (Phase B).
# Infra-missing branches never touch the marker → they stay advisory (graceful skip).
DRIFT_MARKER="$(mktemp 2>/dev/null || echo "/tmp/wiki-drift-marker.$$")"
rm -f "$DRIFT_MARKER" 2>/dev/null || true

# Run the drift detection in a guarded subshell so set -e inside the helper can't
# abort the parent script. Genuine drift is signalled out via $DRIFT_MARKER, not
# via the subshell's exit status (which is deliberately swallowed below).
{
  if [ -z "$HELPER_LIB" ]; then
    echo "::warning::source-hash helper not found — content-drift check skipped (infra unavailable, graceful skip)"
  elif [ ! -f "$MANIFEST" ]; then
    echo "::warning::$MANIFEST absent — content-drift check skipped (infra unavailable, graceful skip). Run '/omcustom:wiki' to seed the manifest."
  elif ! command -v jq >/dev/null 2>&1; then
    echo "::warning::jq not available — content-drift check skipped (infra unavailable, graceful skip)"
  elif ! jq empty "$MANIFEST" 2>/dev/null; then
    # Malformed/corrupt manifest: ONE advisory, skip the drift comparison.
    # Without this guard a corrupt manifest degrades to ~245 false "NEW source" warnings.
    # This is an infra/environment issue (manifest unreadable), NOT genuine drift → advisory.
    echo "::warning::$MANIFEST unreadable (malformed JSON) — content-drift check skipped (infra unavailable, graceful skip). Run '/omcustom:wiki' to re-seed the manifest."
  else
    # Source the shared helper so producer/checker hashing stays in parity.
    # shellcheck source=/dev/null
    if ! . "$HELPER_LIB" 2>/dev/null; then
      echo "::warning::failed to source $HELPER_LIB — content-drift check skipped (infra unavailable, graceful skip)"
    else
      # Generate a fresh manifest to a temp file, then diff against the committed one.
      CUR_MANIFEST="$(mktemp 2>/dev/null || echo "/tmp/wiki-cur-hashes.$$.json")"
      if generate_manifest "$CUR_MANIFEST" 2>/dev/null && [ -s "$CUR_MANIFEST" ]; then
        DRIFT=0

        # Mismatch (stale body) + absent-in-manifest (new source):
        # iterate current keys; compare to manifest value.
        while IFS= read -r line; do
          [ -n "$line" ] || continue
          src="${line%%$'\t'*}"
          cur_hash="${line#*$'\t'}"
          old_hash="$(jq -r --arg k "$src" '.[$k] // empty' "$MANIFEST" 2>/dev/null || true)"
          if [ -z "$old_hash" ]; then
            echo "::warning::content-drift: NEW source not in manifest: $src — remedy: /omcustom:wiki ingest $src"
            DRIFT=$((DRIFT + 1))
          elif [ "$old_hash" != "$cur_hash" ]; then
            echo "::warning::content-drift: STALE wiki page for changed source: $src — remedy: /omcustom:wiki ingest $src"
            DRIFT=$((DRIFT + 1))
          fi
        done < <(jq -r 'to_entries[] | "\(.key)\t\(.value)"' "$CUR_MANIFEST" 2>/dev/null || true)

        # Orphan-in-manifest (deleted source): manifest key absent from current set.
        while IFS= read -r src; do
          [ -n "$src" ] || continue
          cur_val="$(jq -r --arg k "$src" '.[$k] // empty' "$CUR_MANIFEST" 2>/dev/null || true)"
          if [ -z "$cur_val" ]; then
            echo "::warning::content-drift: ORPHAN in manifest (source deleted?): $src — remedy: run '/omcustom:wiki' to refresh the manifest"
            DRIFT=$((DRIFT + 1))
          fi
        done < <(jq -r 'keys[]' "$MANIFEST" 2>/dev/null || true)

        if [ "$DRIFT" -eq 0 ]; then
          echo "[OK] no content drift detected (all source hashes match manifest)"
        else
          # GENUINE drift: signal the parent to fail the build (Phase B blocking, #1330).
          echo "::error::$DRIFT content-drift item(s) detected — wiki out of sync. Remedy: /omcustom:wiki ingest <path> (Phase B blocking)"
          : > "$DRIFT_MARKER" 2>/dev/null || true
        fi
      else
        echo "::warning::failed to generate current source hashes — content-drift check skipped (infra unavailable, graceful skip)"
      fi
      rm -f "$CUR_MANIFEST" 2>/dev/null || true
    fi
  fi
} || echo "::warning::content-drift check encountered an error — skipped (infra error, graceful skip, non-blocking)"

# Phase B (#1330): fail the build ONLY on genuine content drift (marker present).
# Infra-missing / graceful-skip branches never create the marker, so the check
# remains advisory when it is merely unavailable (R021 hard-block promotion scoped
# to real drift only).
if [ -f "$DRIFT_MARKER" ]; then
  rm -f "$DRIFT_MARKER" 2>/dev/null || true
  echo ""
  echo "Fix: run '/omcustom:wiki ingest <path>' to re-sync stale wiki pages, then re-run."
  exit 1
fi
rm -f "$DRIFT_MARKER" 2>/dev/null || true
