---
title: Omcustom Web
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-web/SKILL.md
related:
  - [[status]]
  - [[monitoring-setup]]
---

# Omcustom Web

Control and inspect the built-in Claude Code Web UI.

## Overview

Controls and inspects Claude Code's built-in web interface. Supports enabling/disabling the web UI, opening the browser, inspecting current web UI state, and managing web-based session views. Used for monitoring and controlling long-running sessions through the browser interface rather than the terminal.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom-web`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[status]], [[monitoring-setup]]
- **See also**: `.claude/settings.local.json`

## Sources

- `.claude/skills/omcustom-web/SKILL.md` — skill definition
