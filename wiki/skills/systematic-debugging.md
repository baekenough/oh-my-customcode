---
title: Systematic Debugging
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/systematic-debugging/SKILL.md
related:
  - [[dev-review]]
  - [[adversarial-review]]
  - [[stuck-recovery]]
---

# Systematic Debugging

Structured debugging workflow for any bug, test failure, or unexpected behavior.

## Overview

Provides a systematic 5-step debugging process: (1) Reproduce reliably, (2) Isolate the problem (binary search / bisect), (3) Understand the root cause (not just the symptom), (4) Fix the root cause, (5) Verify the fix doesn't regress. Documents assumptions at each step. Uses binary search for large codebases and git bisect for regressions. Prevents guess-and-check debugging.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Effort**: not specified

## Relationships

- **Used by agents**: all agents when encountering bugs
- **Related skills**: [[dev-review]], [[adversarial-review]], [[stuck-recovery]]
- **See also**: [[R004]]

## Sources

- `.claude/skills/systematic-debugging/SKILL.md` — skill definition
