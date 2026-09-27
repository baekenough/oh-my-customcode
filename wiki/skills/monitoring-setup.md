---
title: Monitoring Setup
type: skill
updated: 2026-09-27
sources:
  - .claude/skills/monitoring-setup/SKILL.md
related:
  - [[status]]
---

# Monitoring Setup

Enable/disable OpenTelemetry console monitoring for Claude Code usage tracking.

## Overview

Enables or disables OpenTelemetry console monitoring, branching on the installed Claude Code version (`claude --version`, compared component-wise, not lexicographically). When enabled, Claude Code outputs usage metrics (cost, tokens, sessions, LOC, commits, PRs, active time) and events to the terminal via `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_METRICS_EXPORTER`, and `OTEL_LOGS_EXPORTER` env vars. Supports `enable`, `disable`, and `status` subcommands.

Below 2.1.282, the skill configures `.claude/settings.local.json`. **CC 2.1.282+ ignores these OpenTelemetry variables when set in project or local settings files** (export-enabling, endpoint, and content-capture variables), so on 2.1.282+ the skill instead presents the `env` block for user-scope `~/.claude/settings.json` or a shell `export`, and writes `~/.claude/settings.json` only with the user's explicit approval in that call (a project-scope skill touching a user-scope file requires this per R002).

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/omcustom:monitoring-setup`
- **Effort**: not specified
- **Argument hint**: `[enable|disable|status]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[status]]
- **See also**: `.claude/settings.local.json` (below 2.1.282), `~/.claude/settings.json` (2.1.282+)

## Sources

- `.claude/skills/monitoring-setup/SKILL.md` — skill definition
