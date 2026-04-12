---
title: RTK Exec
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/rtk-exec/SKILL.md
related:
  - [[codex-exec]]
  - [[gemini-exec]]
---

# RTK Exec

Execute CLI commands through RTK proxy for token compression.

## Overview

Wraps CLI command execution through an RTK (Reduce Token Kit) proxy that compresses verbose CLI output before returning it to the model. Useful for commands that produce very long output (build logs, test results, large diffs) where token efficiency matters. Requires RTK CLI installed. Results are compressed and returned to the calling context.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/rtk-exec`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[codex-exec]], [[gemini-exec]]
- **See also**: [[R005]], [[R013]]

## Sources

- `.claude/skills/rtk-exec/SKILL.md` — skill definition
