---
title: "Claude Code Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/claude-code/01-overview.md
related:
  - [[mgr-claude-code-bible]]
---

# Claude Code Guide

Reference documentation for Claude Code capabilities, features, and API integration patterns.

## Overview

Covers Claude's advanced API features for building Claude Code-compatible applications and agents. Topics include the 1M token context window, Agent Skills, batch processing, citations, extended thinking, Files API, structured outputs, and tool use. Also documents built-in tools (Bash, code execution, computer use, MCP connector, web fetch/search). Used by `mgr-claude-code-bible` for spec compliance verification.

## Key Topics

- Core features: context window, batch processing, prompt caching, structured outputs
- Tool integrations: Bash, code execution, computer use, text editor, web fetch/search
- Agent Skills and custom skill creation
- MCP connector and remote server integration
- Extended thinking for complex reasoning tasks
- Citations and search results for RAG applications
- Token counting and effort control

## Relationships

- **Used by agents**: [[mgr-claude-code-bible]]
- **Related skills**: [[claude-native]]
- **See also**: [[skill-bundle-design]], [[hook-data-flow]]

## Sources

- `guides/claude-code/01-overview.md` — feature overview, tool catalog, API capabilities
