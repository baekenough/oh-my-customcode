#!/bin/bash
# FileChanged hook — detect external file modifications
# Advisory warning when files are modified outside Claude Code

input=$(cat)
file_path=$(printf '%s\n' "$input" | jq -r '.file_path // ""' 2>/dev/null)
change_type=$(printf '%s\n' "$input" | jq -r '.change_type // "modified"' 2>/dev/null)

if [ -z "$file_path" ]; then
  printf '%s\n' "$input"
  exit 0
fi

echo "[Hook] External file change detected: ${change_type} ${file_path}" >&2

# Warn about important files
case "$file_path" in
  */CLAUDE.md|*/hooks.json|*/settings*.json)
    echo "[Hook] WARNING: Configuration file changed externally — re-read recommended" >&2
    ;;
  *.lock|*lockfile*)
    echo "[Hook] Lock file changed — dependency state may have shifted" >&2
    ;;
esac

printf '%s\n' "$input"
