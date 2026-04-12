---
title: Gemini Exec
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/gemini-exec/SKILL.md
related:
  - [[codex-exec]]
  - [[agora]]
  - [[rtk-exec]]
---

# Gemini Exec

Execute Gemini CLI prompts and return results for multi-model workflows.

## Overview

Wraps the Gemini CLI to execute prompts and return results to the orchestrator. Used in multi-model workflows (agora, multi-model-verification) to get a Gemini perspective on code, designs, or plans. Requires Gemini CLI installed and configured. Results are forwarded back to the calling context for synthesis.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/gemini-exec`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator, [[agora]]
- **Related skills**: [[codex-exec]], [[rtk-exec]], [[agora]], [[multi-model-verification]]
- **See also**: [[R009]]

## Sources

- `.claude/skills/gemini-exec/SKILL.md` — skill definition
