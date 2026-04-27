---
title: Profile
type: skill
updated: 2026-04-27
sources:
  - .claude/skills/profile/SKILL.md
related:
  - [[sys-memory-keeper]]
  - [[token-efficiency-audit]]
---

# Profile

Load a skill profile to switch active plugin set for a specific workflow context.

## Overview

Switches the active plugin set in `~/.claude/settings.json` to match a named workflow profile, reducing per-spawn skill enumeration overhead. Four built-in profiles cover common contexts: web-app, data-eng, harness-dev, and minimal. Profile changes take effect after session restart. Addresses #1041 hypothesis A (token overhead from full plugin enumeration).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/profile <profile-name> | list | current`
- **Argument hint**: `<profile-name> | list | current`
- **Allowed tools**: Read, Bash, Edit, Write

## Commands

| Command | Action |
|---------|--------|
| `/profile list` | Show all available profiles and currently active one |
| `/profile current` | Show currently active profile |
| `/profile load <name>` | Activate a profile (requires session restart) |
| `/profile reset` | Remove active profile marker (restores full plugin set) |

## Built-in Profiles

| Profile | Purpose |
|---------|---------|
| `web-app` | Web application development (frontend + auth + deploy) |
| `data-eng` | Data engineering sessions (Airflow, Spark, Kafka, Snowflake, dbt) |
| `harness-dev` | oh-my-customcode harness development (agent/skill/rule authoring) |
| `minimal` | Minimal plugin set for low-overhead sessions (memory + core only) |

## Implementation Notes

- Profile JSON files live in `.claude/profiles/*.json`
- Active profile marker stored in `.claude/profiles/.active`
- All `.claude/` writes use the /tmp bypass pattern (R010 sensitive-path protocol)
- `enabledPlugins` in `~/.claude/settings.json` is updated with per-plugin boolean flags
- Plugins not listed in a profile retain their current state

## Relationships

- **Related issues**: #1041 (token overhead), #1080 (skill implementation)
- **See also**: [[R010]], [[R013]]

## Sources

- `.claude/skills/profile/SKILL.md` — skill definition
