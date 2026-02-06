#!/bin/bash
# Claude Code Hooks & Contexts Installer
# Source: https://github.com/affaan-m/everything-claude-code
# Hook installation script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${HOME}/.claude"
SETTINGS_FILE="${CLAUDE_HOME}/settings.json"

echo "┌─────────────────────────────────────────────┐"
echo "│  Claude Code Hooks & Contexts Installer     │"
echo "└─────────────────────────────────────────────┘"
echo ""

# Create directories
echo "[1/5] Creating directories..."
mkdir -p "${CLAUDE_HOME}/hooks/memory-persistence"
mkdir -p "${CLAUDE_HOME}/hooks/strategic-compact"
mkdir -p "${CLAUDE_HOME}/sessions"
mkdir -p "${CLAUDE_HOME}/skills/learned"
mkdir -p "${CLAUDE_HOME}/contexts"
echo "      ✓ Directories created"

# Copy scripts
echo "[2/5] Copying hook scripts..."
cp "${SCRIPT_DIR}/hooks/memory-persistence/"*.sh "${CLAUDE_HOME}/hooks/memory-persistence/"
cp "${SCRIPT_DIR}/hooks/strategic-compact/"*.sh "${CLAUDE_HOME}/hooks/strategic-compact/"
echo "      ✓ Scripts copied"

# Copy contexts
echo "[3/5] Copying context files..."
cp "${SCRIPT_DIR}/contexts/"*.md "${CLAUDE_HOME}/contexts/"
echo "      ✓ Contexts copied"

# Set permissions
echo "[4/5] Setting execute permissions..."
chmod +x "${CLAUDE_HOME}/hooks/memory-persistence/"*.sh
chmod +x "${CLAUDE_HOME}/hooks/strategic-compact/"*.sh
echo "      ✓ Permissions set"

# Handle settings.json
echo "[5/5] Configuring settings.json..."

if [ -f "$SETTINGS_FILE" ]; then
  # Backup existing settings
  BACKUP_FILE="${SETTINGS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$SETTINGS_FILE" "$BACKUP_FILE"
  echo "      ✓ Backed up existing settings to: $BACKUP_FILE"

  # Check if jq is available for merging
  if command -v jq &> /dev/null; then
    # Merge hooks into existing settings
    HOOKS_JSON="${SCRIPT_DIR}/hooks/hooks.json"
    TEMP_FILE=$(mktemp)

    # Extract hooks from hooks.json and merge with existing settings
    jq -s '.[0] * .[1]' "$SETTINGS_FILE" "$HOOKS_JSON" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$SETTINGS_FILE"
    echo "      ✓ Merged hooks into settings.json"
  else
    echo "      ⚠ jq not found. Please manually merge hooks."
    echo "      Copy content from: ${SCRIPT_DIR}/hooks/hooks.json"
    echo "      Into: ${SETTINGS_FILE}"
  fi
else
  # Create new settings.json from hooks.json
  cp "${SCRIPT_DIR}/hooks/hooks.json" "$SETTINGS_FILE"
  echo "      ✓ Created new settings.json"
fi

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  Installation Complete!                     │"
echo "└─────────────────────────────────────────────┘"
echo ""
echo "Installed to: ${CLAUDE_HOME}/"
echo ""
echo "Structure:"
echo "  ~/.claude/"
echo "  ├── settings.json          (hooks config)"
echo "  ├── hooks/"
echo "  │   ├── memory-persistence/"
echo "  │   │   ├── pre-compact.sh"
echo "  │   │   ├── session-start.sh"
echo "  │   │   └── session-end.sh"
echo "  │   └── strategic-compact/"
echo "  │       └── suggest-compact.sh"
echo "  ├── contexts/"
echo "  │   ├── dev.md"
echo "  │   ├── review.md"
echo "  │   └── research.md"
echo "  ├── sessions/              (auto-created logs)"
echo "  └── skills/learned/        (for future use)"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to activate hooks"
echo "  2. Use contexts by referencing them in prompts"
echo ""
