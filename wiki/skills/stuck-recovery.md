---
title: Stuck Recovery
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/stuck-recovery/SKILL.md
related:
  - [[model-escalation]]
  - [[pipeline-guards]]
  - [[structured-dev-cycle]]
---

# Stuck Recovery

Detect stuck loops and advise recovery strategies.

## Overview

Detects when agents are stuck in repetitive failure loops and advises recovery strategies. Monitors for: same error repeated 3+ times, task duration exceeding 2x average, no progress on file modifications, or identical tool call sequences. Advises: model escalation, task decomposition, alternative approach, or user clarification. Advisory-only — never blocks or terminates agents autonomously.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator (via hooks)
- **Related skills**: [[model-escalation]], [[pipeline-guards]], [[task-decomposition]]
- **See also**: [[R004]], [[R021]]

## Sources

- `.claude/skills/stuck-recovery/SKILL.md` — skill definition
