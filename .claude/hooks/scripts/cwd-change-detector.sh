#!/bin/bash
# CwdChanged hook — detect project type on directory change
# Advisory only — provides context hints when cwd changes

input=$(cat)
new_cwd=$(echo "$input" | jq -r '.new_cwd // ""' 2>/dev/null)

if [ -z "$new_cwd" ] || [ ! -d "$new_cwd" ]; then
  echo "$input"
  exit 0
fi

hints=""

# Detect project type indicators
if [ -f "$new_cwd/package.json" ]; then
  hints="${hints}[Hook] Node.js project detected\n"
fi
if [ -f "$new_cwd/go.mod" ]; then
  hints="${hints}[Hook] Go project detected\n"
fi
if [ -f "$new_cwd/Cargo.toml" ]; then
  hints="${hints}[Hook] Rust project detected\n"
fi
if [ -f "$new_cwd/pyproject.toml" ] || [ -f "$new_cwd/requirements.txt" ]; then
  hints="${hints}[Hook] Python project detected\n"
fi
if [ -f "$new_cwd/CLAUDE.md" ]; then
  hints="${hints}[Hook] oh-my-customcode project detected\n"
fi

if [ -n "$hints" ]; then
  printf "%b" "$hints" >&2
fi

echo "$input"
