---
title: Codex Exec
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/codex-exec/SKILL.md
related:
  - [[gemini-exec]]
  - [[agora]]
  - [[structured-dev-cycle]]
---

# Codex Exec

Execute OpenAI Codex CLI prompts and return results for multi-model workflows.

## Overview

Wraps the OpenAI Codex CLI to execute prompts and return results to the orchestrator. Used in multi-model workflows (agora, structured-dev-cycle Codex hybrid) to get a GPT perspective on code or designs. Requires Codex CLI installed. Results are forwarded back to the calling context for synthesis.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/codex-exec`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator, [[agora]]
- **Related skills**: [[gemini-exec]], [[rtk-exec]], [[agora]], [[structured-dev-cycle]]
- **See also**: [[R009]]

## Sources

- `.claude/skills/codex-exec/SKILL.md` — skill definition
