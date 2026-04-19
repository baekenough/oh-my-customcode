---
title: "cc-token-saver Integration Guide"
type: guide
updated: 2026-04-18
sources:
  - guides/cc-token-saver/README.md
related:
  - [[R012]]
  - [[R013]]
  - [[R009]]
  - [[R010]]
  - [[R018]]
---

# cc-token-saver Integration Guide

External plugin for token cost optimization and session continuity — resolves conflicts with oh-my-customcode's native statusline and delegation rules.

## Overview

[cc-token-saver](https://github.com/ww-w-ai/cc-token-saver) (Apache-2.0) is an external Claude Code plugin providing cache TTL monitoring, cost dashboards, and zero-cost context restore. Because oh-my-customcode has its own statusline (R012) and delegation model (R009/R010/R018), some features overlap and require explicit priority rules.

## Installation

```bash
claude plugin marketplace add ww-w-ai/cc-token-saver
claude plugin install cc-token-saver
```

## Key Features

| Feature | Description |
|---------|-------------|
| Token Guardian | Detects 1h prompt cache TTL idle expiry and warns before cache invalidates |
| Smart Session Architecture | Auto-injects SubTask delegation patterns into context |
| `/continue` | Zero-cost context restore after session pause |
| Live Status Line | Real-time token/cost status bar |
| `/usage-view` | Cost dashboard showing per-session and cumulative spend |
| `/report-limit` | Community-sourced rate limit reporting |

## Conflict Resolution

### Live Status Line (R012 Priority)

oh-my-customcode's `.claude/statusline.sh` (R012) already covers Cost, Rate Limit %, Weekly Limit %, and Context %. cc-token-saver's Live Status Line is redundant when R012 is active. R012 statusline takes priority — disable or ignore cc-token-saver's status bar.

### SubTask Delegation (R009/R010/R018 Priority)

cc-token-saver's Smart Session Architecture injects SubTask delegation patterns. Internal rules always override external skills (R010). When cc-token-saver suggests SubTask patterns, use the oh-my-customcode routing skill + Agent tool instead, with specialized agents per domain (R010) and parallel execution when independent (R009).

### Token Guardian and R013 (Coexistence)

Token Guardian (idle cache TTL) and `context-budget-advisor.sh` (R013, context % threshold) solve different problems and run simultaneously without conflict. Both warnings are useful.

## Conflict-Free Features

`/continue`, `/usage-view`, and `/report-limit` have no conflicts with internal rules — use freely.

## Three-Layer Context

cc-token-saver is Layer 1 in the three-layer token defense stack. See [[token-efficiency]] for the full stack: Layer 2 (R013 Ecomode) and Layer 3 (settings-based gates) complement Token Guardian without overlap.

## Sources

- `guides/cc-token-saver/README.md` — integration guide with conflict resolution details
- `guides/claude-code/14-token-efficiency.md` — three-layer defense stack overview
