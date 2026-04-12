---
title: Monitoring Setup
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/monitoring-setup/SKILL.md
related:
  - [[status]]
---

# Monitoring Setup

Enable/disable OpenTelemetry console monitoring for Claude Code usage tracking.

## Overview

Configures `.claude/settings.local.json` to enable or disable OpenTelemetry console monitoring. When enabled, Claude Code outputs usage metrics (cost, tokens, sessions, LOC, commits, PRs, active time) and events to the terminal via `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_METRICS_EXPORTER`, and `OTEL_LOGS_EXPORTER` env vars. Supports `enable`, `disable`, and `status` subcommands.

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/omcustom:monitoring-setup`
- **Effort**: not specified
- **Argument hint**: `[enable|disable|status]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[status]]
- **See also**: `.claude/settings.local.json`

## Sources

- `.claude/skills/monitoring-setup/SKILL.md` — skill definition
