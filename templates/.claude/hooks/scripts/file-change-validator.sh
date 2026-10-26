#!/bin/bash
# FileChanged hook — detect external file modifications
# Advisory warning when files are modified outside Claude Code

input=$(cat)
file_path=$(printf '%s\n' "$input" | jq -r '.file_path // ""' 2>/dev/null)
change_type=$(printf '%s\n' "$input" | jq -r '.event // .change_type // "modified"' 2>/dev/null)

if [ -z "$file_path" ]; then
  printf '%s\n' "$input"
  exit 0
fi

echo "[Hook] External file change detected: ${change_type} ${file_path}" >&2

# Warn about important files
# Arms mirror the hooks.json FileChanged matcher (literal working-directory filenames).
# Nested paths such as .claude/hooks/hooks.json or .claude/settings*.json cannot be matched
# (the matcher only registers literal filenames in the working directory), so no arm for them.
case "$file_path" in
  CLAUDE.md|*/CLAUDE.md)
    echo "[Hook] WARNING: Configuration file changed externally — re-read recommended" >&2
    ;;
  package-lock.json|*/package-lock.json|pnpm-lock.yaml|*/pnpm-lock.yaml|*.lock)
    echo "[Hook] Lock file changed — dependency state may have shifted" >&2
    ;;
esac

printf '%s\n' "$input"
