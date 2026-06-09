#!/usr/bin/env bash
# source-hash.sh — shared SHA-256 hashing helper for wiki content-drift detection (#1325 Phase A).
#
# Purpose: a SINGLE source of hashing truth shared by the PRODUCER (wiki sync, Phase B —
# not yet integrated) and the CHECKER (.github/scripts/verify-wiki-sync.sh). Both must compute
# hashes identically so that an unchanged source never produces false drift (parity invariant).
#
# Cross-platform: shasum -a 256 (macOS) / sha256sum (Linux). LC_ALL=C for deterministic sort.
# Source-set must mirror verify-wiki-sync.sh: agents (.claude/agents/*.md),
# skills (.claude/skills/*/SKILL.md), rules (.claude/rules/*.md), guides (guides/*/ dirs, concat-hashed).
#
# Source-able (functions) AND runnable:
#   bash .github/scripts/lib/source-hash.sh generate <output_path>   → writes manifest JSON
#
# This file is intentionally side-effect-free when sourced (no top-level execution).

# ── portable_sha256: read stdin, emit the hex digest only ─────────────────────
portable_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    echo "ERROR: neither shasum nor sha256sum found" >&2
    return 1
  fi
}

# ── hash_one_file <path>: SHA-256 of a single file, hex only ──────────────────
hash_one_file() {
  local path="$1"
  [ -f "$path" ] || { echo "ERROR: hash_one_file: not a file: $path" >&2; return 1; }
  portable_sha256 < "$path"
}

# ── hash_dir_concat <dir>: sorted-concat hash of all files under a directory ──
# Deterministic: file list sorted with LC_ALL=C, then contents concatenated and hashed.
# An empty/absent directory yields the hash of empty input (stable, no error).
hash_dir_concat() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    echo "ERROR: hash_dir_concat: not a directory: $dir" >&2
    return 1
  fi
  # find → deterministic NUL-delimited sort → concat contents → hash.
  # NUL-safe (`-print0` / `sort -z` / `xargs -0`) so filenames containing literal
  # newlines are never split into bogus args. `cat` with no args (empty file list)
  # reads stdin and would hang, so guard the empty case first.
  if [ -z "$(find "$dir" -type f 2>/dev/null | head -c1)" ]; then
    printf '' | portable_sha256
    return 0
  fi
  find "$dir" -type f -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0 cat | portable_sha256
}

# ── generate_manifest <output_path>: emit {source_path: hash, ...} JSON ───────
# Walks the same source set verify-wiki-sync.sh checks. Keys are sorted for determinism.
# Single files → hash_one_file; guide directories → hash_dir_concat.
generate_manifest() {
  local out="$1"
  if [ -z "$out" ]; then
    echo "ERROR: generate_manifest: output path required" >&2
    return 1
  fi

  # Collect "path<TAB>hash" lines, then sort by path and assemble JSON.
  local entries
  entries=$(
    # Agents — single .md files
    for src in .claude/agents/*.md; do
      [ -e "$src" ] || continue
      printf '%s\t%s\n' "$src" "$(hash_one_file "$src")"
    done

    # Skills — each SKILL.md file
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      printf '%s\t%s\n' "$src" "$(hash_one_file "$src")"
    done < <(find .claude/skills -name "SKILL.md" 2>/dev/null)

    # Rules — single .md files
    for src in .claude/rules/*.md; do
      [ -e "$src" ] || continue
      printf '%s\t%s\n' "$src" "$(hash_one_file "$src")"
    done

    # Guides — directories (multi-file → sorted-concat hash)
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      printf '%s\t%s\n' "$src" "$(hash_dir_concat "$src")"
    done < <(find guides -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
  )

  # Sort by path (key) for stable, diff-friendly output, then build JSON with jq.
  printf '%s\n' "$entries" \
    | grep -v '^[[:space:]]*$' \
    | LC_ALL=C sort \
    | jq -R -s '
        split("\n")
        | map(select(length > 0) | split("\t") | {key: .[0], value: .[1]})
        | from_entries
      ' > "$out"
}

# ── CLI entrypoint (only when executed, not when sourced) ─────────────────────
# BASH_SOURCE[0] != $0  → sourced; equal → executed directly.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  cmd="${1:-}"
  case "$cmd" in
    generate)
      shift
      generate_manifest "${1:-}"
      ;;
    *)
      echo "Usage: bash $0 generate <output_path>" >&2
      echo "       (or 'source $0' to use hash_one_file / hash_dir_concat / generate_manifest)" >&2
      exit 1
      ;;
  esac
fi
