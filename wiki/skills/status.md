---
title: Status
type: skill
updated: 2026-11-24
sources:
  - .claude/skills/status/SKILL.md
related:
  - [[lists]]
  - [[help]]
  - [[monitoring-setup]]
---

# Status

Show system status and health checks.

## Overview

Displays a comprehensive system status: rules loaded, agent counts by category, skill counts, guide count. Every count is measured at run time, never hardcoded: rules are counted from `.claude/rules/*.md` and grouped by the `MUST-`/`SHOULD-`/`MAY-` file-name prefix, the rule ID is read from each file's `**ID**:` header line, and the rules line shows the measured count with no ID range, because projects add their own rules, agents, skills and guides. The example output in the skill uses `{N}` placeholders, and the default status example no longer has the `Commands: 60+ available` line. `--verbose` shows each agent and skill with validity status. `--health` runs integrity checks (all agent files exist, skill references valid, external sources reachable, CLAUDE.md in sync). Used for quick system health verification.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:status`
- **Effort**: not specified
- **Argument hint**: `[--verbose] [--health]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[lists]], [[help]]
- **See also**: [[R017]]

## Sources

- `.claude/skills/status/SKILL.md` — skill definition
- Content-drift resync 2026-10-25: source sample output now shows "Total: 114 skills" (was 115); no other change.
- Content-drift resync 2026-11-24 (#1987): source gained a `## Measurement` section stating "Every count in the output is measured at run time from the files present in the project."; example output uses `{N}` placeholders; the `Commands: 60+ available` line and the `R000-R023` range were removed.
