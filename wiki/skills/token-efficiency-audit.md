---
title: Token Efficiency Audit
type: skill
updated: 2026-04-19
sources:
  - .claude/skills/token-efficiency-audit/SKILL.md
related:
  - [[monitoring-setup]]
  - [[R013]]
  - [[pipeline]]
---

# Token Efficiency Audit

Layer 3 of the three-layer token defense stack — audit Claude Code settings against the lever reference table, apply safe levers interactively or for CI, and report combined stack status.

## Overview

Operates at config time to prevent token overhead before it enters the context window. Works alongside cc-token-saver (Layer 1, cache defense) and R013 Ecomode (Layer 2, runtime compression). Each layer is independently deployable and non-overlapping.

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/token-efficiency-audit`
- **Version**: 1.0.0
- **Argument hint**: `[audit|apply-interactive|apply-ci|status]`

## Modes

| Mode | Purpose |
|------|---------|
| `audit` (default) | Report current vs recommended for 7 levers across `settings.json` and `settings.local.json` |
| `apply-interactive` | Apply safe interactive levers (git instructions, IDE connect, attribution, output caps) |
| `apply-ci` | Apply CI/worker-only levers — **HIGH risk**, requires explicit confirmation, disables rules/agents/MCP/memory |
| `status` | Show all three stack layers: cc-token-saver installed?, Ecomode configured?, N/7 levers at recommended |

## Guardrails

Output caps have a minimum floor to avoid the re-call trap (setting limits too low forces repeated chunked re-reads costing more tokens). Recommended floors: `BASH_MAX_OUTPUT_LENGTH` 15000, `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` 8000, `MAX_MCP_OUTPUT_TOKENS` 8000. Values below floor trigger a warning before applying.

## Relationships

- **Related skills**: [[monitoring-setup]] (OTel metrics to measure effectiveness)
- **Governed by**: [[R013]] (Layer 2 Ecomode specification)
- **See also**: `guides/claude-code/14-token-efficiency.md`, `guides/cc-token-saver/README.md`, `guides/claude-code/13-cli-flags.md`

## Sources

- `.claude/skills/token-efficiency-audit/SKILL.md` — skill definition
