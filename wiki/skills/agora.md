---
title: Agora
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/agora/SKILL.md
related:
  - [[codex-exec]]
  - [[gemini-exec]]
  - [[adversarial-review]]
  - [[R018]]
---

# Agora

Multi-LLM adversarial consensus loop — 3+ LLMs compete to find flaws in designs/specs until unanimous agreement is reached.

## Overview

Spawns Claude (opus), Codex/GPT, and Gemini as competing reviewers who independently analyze a document, then cross-review each other's findings via peer messaging. Loops until all reviewers reach unanimous BUILD or BUILD WITH CHANGES verdict. Final output is a consensus report saved to `.claude/outputs/`. Requires Agent Teams and `codex-exec`/`gemini-exec` skills.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/omcustom:agora`
- **Effort**: max
- **Argument hint**: `<document-path> [--rounds N] [--severity-threshold HIGH]`
- **Source**: external (github: baekenough/baekenough-skills v1.0.0)

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[codex-exec]], [[gemini-exec]], [[adversarial-review]], [[multi-model-verification]]
- **See also**: [[R018]], [[R009]]

## Sources

- `.claude/skills/agora/SKILL.md` — skill definition
