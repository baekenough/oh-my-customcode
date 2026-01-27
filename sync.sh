#!/bin/bash
# Sync baekgom-agents to oh-my-customcode/templates
# This file is gitignored - for personal use only

BAEKGOM_PATH="/Users/sangyi/workspace/projects/baekgom-agents"

cd "$(dirname "$0")"
bun run scripts/sync-core.ts "$BAEKGOM_PATH"
