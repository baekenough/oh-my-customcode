#!/bin/bash
# HUD Statusline Hook - Update status display
#
# Displays real-time status information during agent operations.
# Output via stderr to avoid polluting tool output.
#
# Usage: update-status.sh <agent> [progress] [parallel_count]
#
# Examples:
#   update-status.sh "creator" "1/3"
#   update-status.sh "secretary" "0/4" "4"
#   update-status.sh "golang-expert"

AGENT="${1:-claude}"
PROGRESS="${2:-}"
PARALLEL="${3:-0}"

# Build status line
STATUS="[Agent] $AGENT"

# Add progress if provided
if [ -n "$PROGRESS" ]; then
  STATUS="$STATUS | [Progress] $PROGRESS"
fi

# Add parallel count if > 0
if [ "$PARALLEL" -gt 0 ] 2>/dev/null; then
  STATUS="$STATUS | [Parallel] $PARALLEL"
fi

# Output to stderr to avoid polluting tool output
echo "─── $STATUS ───" >&2
