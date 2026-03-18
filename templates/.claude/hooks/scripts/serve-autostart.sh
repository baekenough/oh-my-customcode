#!/bin/bash
# Web UI Auto-start Hook
# Trigger: SessionStart
# Purpose: Start packages/serve in the background if not already running
# Protocol: stdin JSON -> stdout pass-through, exit 0 always (never blocks session start)

input=$(cat)

PID_FILE="$HOME/.omcustom-serve.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    # Server already running — silently pass through
    echo "$input"
    exit 0
  else
    # Stale PID file — clean it up
    rm -f "$PID_FILE"
  fi
fi

# Resolve project root: script lives at .claude/hooks/scripts/ -> 3 levels up
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Prefer git-based root detection if available
if command -v git >/dev/null 2>&1; then
  GIT_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")
  if [ -n "$GIT_ROOT" ]; then
    PROJECT_ROOT="$GIT_ROOT"
  fi
fi

# Locate the build artifact
BUILD_FILE="${PROJECT_ROOT}/packages/serve/build/index.js"

if [ ! -f "$BUILD_FILE" ]; then
  # Build not present — skip silently (advisory only)
  echo "[Hook] Web UI build not found, skipping auto-start (${BUILD_FILE})" >&2
  echo "$input"
  exit 0
fi

# Ensure node is available
if ! command -v node >/dev/null 2>&1; then
  echo "[Hook] node not found, skipping Web UI auto-start" >&2
  echo "$input"
  exit 0
fi

# Start server fully detached from current process group
OMCUSTOM_PORT="${OMCUSTOM_PORT:-4321}"
OMCUSTOM_HOST="${OMCUSTOM_HOST:-localhost}"
PORT="$OMCUSTOM_PORT"
HOST="$OMCUSTOM_HOST"

nohup env OMCUSTOM_PORT="$OMCUSTOM_PORT" OMCUSTOM_HOST="$OMCUSTOM_HOST" OMCUSTOM_ORIGIN="http://localhost:${PORT}" node "$BUILD_FILE" \
  >"$HOME/.omcustom-serve.log" 2>&1 \
  </dev/null &
SERVER_PID=$!
disown "$SERVER_PID"

echo "$SERVER_PID" > "$PID_FILE"

echo "[Hook] Web UI started (PID ${SERVER_PID}): http://${HOST}:${PORT}" >&2

# Pass through stdin JSON
echo "$input"
exit 0
