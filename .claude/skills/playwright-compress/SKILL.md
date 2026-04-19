---
name: playwright-compress
description: PostToolUse hook that compresses Playwright MCP tool output using Haiku summarization — Layer 4 of the token defense stack
scope: core
version: 1.0.0
user-invocable: false
disable-model-invocation: true
---

# Playwright MCP Output Compression (Layer 4)

## Purpose

Reduces Playwright MCP tool output tokens by 94-96% using intelligent Haiku summarization while preserving `ref=` values for interactive flow continuity.

## Architecture

```
MCP tool response (37K+ chars)
  ↓ PostToolUse hook
  ↓ playwright-compress.sh
  ↓ claude -p --model haiku (summarize)
  ↓ updatedMCPToolOutput (1.4K-1.9K chars)
```

## Token Defense Stack Position

| Layer | Component | Mechanism | Scope |
|-------|-----------|-----------|-------|
| 1 | cc-token-saver | Time-based budget alerts | Session |
| 2 | R013 Ecomode | Context-aware output compression | Agent |
| 3 | MAX_MCP_OUTPUT_TOKENS | Hard truncation (lossy) | Setting |
| **4** | **playwright-compress** | **Intelligent summarization (lossless ref=)** | **Hook** |

## Behavior

- **Trigger**: PostToolUse on `mcp__playwright__.*` tools
- **Skip condition**: Output < 3000 characters (not worth compressing)
- **ref= preservation**: All `ref=` attribute values are extracted and preserved in the summary
- **Fallback**: If Haiku summarization fails, original output is returned unchanged
- **Auth**: Uses Claude subscription auth (`claude -p`), no API key needed

## Integration

| Rule | Interaction |
|------|-------------|
| R001 | No external data transmission — uses local `claude -p` |
| R013 | Complements Ecomode (Layer 2) with MCP-specific compression |
| R021 | Advisory PostToolUse hook — never blocks |

## Hook Configuration

Configured in `.claude/hooks/hooks.json` PostToolUse section:

```json
{
  "matcher": "mcp_tool_name matches \"mcp__playwright__.*\" || mcp_tool_name matches \"mcp__claude-in-chrome__.*\"",
  "hooks": [{
    "type": "command",
    "command": "bash .claude/hooks/scripts/playwright-compress.sh"
  }],
  "description": "Layer 4: Compress Playwright/Chrome MCP output via Haiku summarization"
}
```

## Source

Adapted from [treesoop/claude-native-plugin](https://github.com/treesoop/claude-native-plugin) playwright-optimizer (MIT).
