#!/bin/sh
# Setup git hooks for oh-my-customcode development

HOOK_DIR=".git/hooks"
HUSKY_DIR=".husky"

# Create hooks directory if it doesn't exist
mkdir -p "$HOOK_DIR"

# Link pre-commit hook
if [ -f "$HUSKY_DIR/pre-commit" ]; then
    cp "$HUSKY_DIR/pre-commit" "$HOOK_DIR/pre-commit"
    chmod +x "$HOOK_DIR/pre-commit"
    echo "Pre-commit hook installed successfully!"
else
    echo "Error: .husky/pre-commit not found"
    exit 1
fi

echo "Git hooks setup complete."
