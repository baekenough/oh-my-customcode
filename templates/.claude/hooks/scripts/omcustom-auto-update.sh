#!/usr/bin/env bash
# SessionStart auto-update hook — interactive omcustom update check
# Trigger: SessionStart (runs BEFORE session-env-check.sh)
# Purpose: Check for oh-my-customcode updates, prompt user, optionally update
# Protocol: stdin JSON -> stdout pass-through, exit 0 ALWAYS
# Design: GitHub issue #752

# Pass through stdin immediately — capture for later output
input=$(cat)

# --- Guard: skip conditions ---

# Skip if explicitly disabled
if [ "${OMCUSTOM_SKIP_AUTO_UPDATE:-}" = "true" ]; then
  echo "$input"
  exit 0
fi

# Skip if /dev/tty not available (CI, Docker, non-interactive)
if ! [ -c /dev/tty ] 2>/dev/null; then
  echo "$input"
  exit 0
fi

# --- Configuration ---
CACHE_DIR="$HOME/.oh-my-customcode"
CACHE_FILE="${CACHE_DIR}/self-update-cache.json"
CACHE_MAX_AGE=3600  # 1 hour in seconds
NPM_TIMEOUT=3       # seconds for npm view
INPUT_TIMEOUT=10     # seconds for user prompt
PACKAGE_NAME="oh-my-customcode"

# --- Helper: semantic version compare ---
# Returns 0 if $1 < $2 (update available)
version_lt() {
  local older
  older=$(printf '%s\n' "$1" "$2" | sort -V | head -1)
  [ "$older" = "$1" ] && [ "$1" != "$2" ]
}

# --- Step 1: Get current installed version ---
CURRENT_VERSION=""

# Try .omcustomrc.json in current directory
if [ -f ".omcustomrc.json" ]; then
  CURRENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .omcustomrc.json 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"')
fi

# Fallback: try npm list
if [ -z "$CURRENT_VERSION" ]; then
  CURRENT_VERSION=$(npm list -g "$PACKAGE_NAME" --depth=0 2>/dev/null | grep -o "${PACKAGE_NAME}@[^ ]*" | cut -d'@' -f2)
fi

# Cannot determine current version — skip
if [ -z "$CURRENT_VERSION" ]; then
  echo "$input"
  exit 0
fi

# --- Step 2: Get latest version (cache-first, network fallback) ---
LATEST_VERSION=""
CACHE_HIT=false

# Ensure cache directory exists
mkdir -p "$CACHE_DIR" 2>/dev/null

# Check cache freshness
if [ -f "$CACHE_FILE" ]; then
  CACHE_TIMESTAMP=$(grep -o '"timestamp"[[:space:]]*:[[:space:]]*[0-9]*' "$CACHE_FILE" 2>/dev/null | grep -o '[0-9]*$')
  CACHED_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$CACHE_FILE" 2>/dev/null | grep -o '"[^"]*"$' | tr -d '"')

  if [ -n "$CACHE_TIMESTAMP" ] && [ -n "$CACHED_VERSION" ]; then
    NOW=$(date +%s)
    AGE=$((NOW - CACHE_TIMESTAMP))

    if [ "$AGE" -lt "$CACHE_MAX_AGE" ]; then
      LATEST_VERSION="$CACHED_VERSION"
      CACHE_HIT=true
    fi
  fi
fi

# Cache miss or stale — fetch from npm registry
if [ "$CACHE_HIT" = false ]; then
  if command -v npm >/dev/null 2>&1; then
    LATEST_VERSION=$(timeout "$NPM_TIMEOUT" npm view "$PACKAGE_NAME" version 2>/dev/null || echo "")

    # Update cache on successful fetch
    if [ -n "$LATEST_VERSION" ]; then
      NOW=$(date +%s)
      cat > "$CACHE_FILE" << EOF
{
  "version": "${LATEST_VERSION}",
  "timestamp": ${NOW},
  "source": "npm-registry"
}
EOF
    fi
  fi
fi

# Could not determine latest version — skip
if [ -z "$LATEST_VERSION" ]; then
  echo "$input"
  exit 0
fi

# --- Step 3: Compare versions ---
if ! version_lt "$CURRENT_VERSION" "$LATEST_VERSION"; then
  # Already up to date
  echo "$input"
  exit 0
fi

# --- Step 4: Prompt user for update ---
echo "" >&2
echo "--- [oh-my-customcode Update Available] ---" >&2
echo "  New version: v${LATEST_VERSION} (current: v${CURRENT_VERSION})" >&2
echo "" >&2

# Interactive prompt via /dev/tty (SessionStart stdin is JSON pipe)
printf "  Update oh-my-customcode to v%s? [y/N] " "$LATEST_VERSION" >/dev/tty 2>/dev/null
if read -r -t "$INPUT_TIMEOUT" answer </dev/tty 2>/dev/null; then
  case "$answer" in
    [yY]|[yY][eE][sS])
      echo "  Installing oh-my-customcode@${LATEST_VERSION}..." >&2
      if npm install -g "${PACKAGE_NAME}@latest" >&2 2>&1; then
        echo "  ✓ Updated to v${LATEST_VERSION}" >&2

        # Check if project harness should be updated too
        if [ -f ".omcustomrc.json" ]; then
          printf "  Update project harness too? [y/N] " >/dev/tty 2>/dev/null
          if read -r -t "$INPUT_TIMEOUT" harness_answer </dev/tty 2>/dev/null; then
            case "$harness_answer" in
              [yY]|[yY][eE][sS])
                echo "  Updating project harness..." >&2
                if command -v omcustom >/dev/null 2>&1; then
                  omcustom update --force >&2 2>&1 || echo "  ⚠ Harness update failed (non-blocking)" >&2
                  echo "  ✓ Project harness updated" >&2
                else
                  echo "  ⚠ omcustom command not found after install" >&2
                fi
                ;;
              *)
                echo "  Skipped harness update" >&2
                ;;
            esac
          else
            echo "" >&2
            echo "  Timed out — skipped harness update" >&2
          fi
        fi
      else
        echo "  ⚠ Update failed (non-blocking, continuing session)" >&2
      fi
      ;;
    *)
      echo "  Skipped update" >&2
      ;;
  esac
else
  echo "" >&2
  echo "  Timed out — skipped update" >&2
fi

echo "------------------------------------" >&2

# Always pass through and exit 0
echo "$input"
exit 0
