#!/bin/bash
# Stop hook: Final audit for console.log and session diagnostics
# Always exits 0 (never blocks session termination)
# Ref: https://github.com/baekenough/oh-my-customcode/issues/206

set -euo pipefail

input=$(cat)

# --- Session diagnostics ---
# Output session status for debugging stop evaluator false positives
echo "[Stop] Session termination audit starting..." >&2

# Check for background task output files (helps diagnose evaluator false positives)
bg_task_files=$(find /tmp -maxdepth 1 -name "claude-*.output" 2>/dev/null | wc -l | tr -d ' ')
if [ "$bg_task_files" -gt 0 ]; then
  echo "[Stop] Background task output files found: ${bg_task_files} (informational only — these are normal)" >&2
fi

# --- Console.log audit ---
if git rev-parse --git-dir > /dev/null 2>&1; then
  modified_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)

  if [ -n "$modified_files" ]; then
    has_console=false
    while IFS= read -r file; do
      if [ -f "$file" ]; then
        if grep -q "console\.log" "$file" 2>/dev/null; then
          echo "[Stop] WARNING: console.log found in $file" >&2
          has_console=true
        fi
      fi
    done <<< "$modified_files"

    if [ "$has_console" = true ]; then
      echo "[Stop] Remove console.log statements before committing" >&2
    fi
  fi
fi

echo "[Stop] Audit complete. Session safe to terminate." >&2

# CRITICAL: Always pass through input and exit 0
# This hook MUST NEVER block session termination
echo "$input"
exit 0
