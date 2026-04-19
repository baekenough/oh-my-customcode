---
title: Playwright Compress
type: skill
updated: 2026-04-19
sources:
  - .claude/skills/playwright-compress/SKILL.md
related:
  - [[token-efficiency-audit]]
  - [[token-efficiency]]
  - [[R013]]
  - [[R021]]
  - [[browser-automation]]
---

# Playwright Compress

PostToolUse hook that compresses Playwright MCP tool output using Haiku summarization — Layer 4 of the token defense stack.

## Overview

Reduces Playwright MCP tool output tokens by 94–96% using intelligent Haiku summarization while preserving `ref=` values for interactive flow continuity. Operates as a PostToolUse hook triggered on `mcp__playwright__.*` and `mcp__claude-in-chrome__.*` tools. If output is under 3000 characters, compression is skipped. If Haiku summarization fails, the original output is returned unchanged (safe fallback).

## Key Details

- **Scope**: core
- **User-invocable**: no (hook-based, automatic)
- **Model-invocable**: no (`disable-model-invocation: true`)
- **Version**: 1.0.0
- **Token defense stack position**: Layer 4 (intelligent summarization, lossless `ref=`)

## Token Defense Stack

| Layer | Component | Mechanism |
|-------|-----------|-----------|
| 1 | cc-token-saver | Time-based budget alerts |
| 2 | R013 Ecomode | Context-aware output compression |
| 3 | MAX_MCP_OUTPUT_TOKENS | Hard truncation (lossy) |
| **4** | **playwright-compress** | **Intelligent summarization (lossless ref=)** |

## Relationships

- **Related skills**: [[token-efficiency-audit]], [[browser-automation]]
- **Rules**: [[R013]] (Ecomode, Layer 2 complement), [[R021]] (advisory hook)
- **Guide**: [[token-efficiency]]
- **Source**: Adapted from [treesoop/claude-native-plugin](https://github.com/treesoop/claude-native-plugin) playwright-optimizer (MIT)

## Sources

- `.claude/skills/playwright-compress/SKILL.md` — skill definition
- `.claude/hooks/hooks.json` — PostToolUse hook configuration
