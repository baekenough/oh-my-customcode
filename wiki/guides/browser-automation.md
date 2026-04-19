---
title: Browser Automation Guide
type: guide
updated: 2026-04-19
sources:
  - guides/browser-automation/01-browser-automation-patterns.md
related:
  - [[skills/playwright-compress]]
  - [[R001]]
  - [[R018]]
  - [[guides/web-design]]
  - [[guides/web-scraping]]
---

# Browser Automation Guide

Reference guide for AI-controlled browser automation patterns, focusing on integration with Claude Code and MCP-based browser tools.

## Overview

Covers four core automation patterns: MCP-based browser control (recommended), cookie-based authentication, anti-bot stealth patterns, and cross-AI vendor orchestration. Emphasizes security compliance (R001) and authorized-use-only automation.

## Tools Available

| Tool | Scope | Configuration |
|------|-------|---------------|
| `mcp__claude-in-chrome__*` | Chrome DevTools Protocol | MCP server in settings |
| `mcp__playwright__*` | Playwright automation | MCP server in settings |
| `playwright-compress` | Output compression (Layer 4) | PostToolUse hook |

## Key Patterns

- **MCP-based control**: Native `mcp__playwright__*` or `mcp__claude-in-chrome__*` tools — preferred over external Playwright scripts.
- **Cookie-based auth**: Import cookies from real browser sessions for QA testing of authenticated pages.
- **Anti-bot stealth**: Realistic viewports, human-like delays, randomized mouse movement — only for authorized targets.
- **Cross-AI orchestration**: Share browser sessions via shared MCP server, ngrok tunnels (scoped tokens), or Agent Teams (R018).

## Security Considerations

R001 compliance is mandatory: no credentials hardcoded, no PII to external services, rate limit respect, scope limited to authorized applications.

## Relationships

- **Related skill**: [[skills/playwright-compress]] (Layer 4 output compression for MCP tools)
- **Rules**: [[R001]] (safety), [[R018]] (Agent Teams for cross-AI coordination)
- **Guides**: [[guides/web-scraping]], [[guides/web-design]]

## Sources

- `guides/browser-automation/01-browser-automation-patterns.md` — pattern reference
