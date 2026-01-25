#!/bin/bash
# Claude Code Hooks & Contexts Uninstaller
# Removes hooks installed by install-hooks.sh

set -e

CLAUDE_HOME="${HOME}/.claude"
SETTINGS_FILE="${CLAUDE_HOME}/settings.json"

echo "┌─────────────────────────────────────────────┐"
echo "│  Claude Code Hooks Uninstaller              │"
echo "└─────────────────────────────────────────────┘"
echo ""

read -p "This will remove hooks from ~/.claude/. Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "[1/3] Removing hook scripts..."
rm -rf "${CLAUDE_HOME}/hooks/memory-persistence"
rm -rf "${CLAUDE_HOME}/hooks/strategic-compact"
echo "      ✓ Hook scripts removed"

echo "[2/3] Removing context files..."
rm -f "${CLAUDE_HOME}/contexts/dev.md"
rm -f "${CLAUDE_HOME}/contexts/review.md"
rm -f "${CLAUDE_HOME}/contexts/research.md"
echo "      ✓ Context files removed"

echo "[3/3] Cleaning settings.json..."
if [ -f "$SETTINGS_FILE" ] && command -v jq &> /dev/null; then
  TEMP_FILE=$(mktemp)
  jq 'del(.hooks)' "$SETTINGS_FILE" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$SETTINGS_FILE"
  echo "      ✓ Hooks removed from settings.json"
else
  echo "      ⚠ Please manually remove 'hooks' from settings.json"
fi

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  Uninstall Complete!                        │"
echo "└─────────────────────────────────────────────┘"
echo ""
echo "Note: sessions/ and skills/ directories preserved."
echo "Remove manually if needed: rm -rf ~/.claude/sessions ~/.claude/skills"
echo ""
