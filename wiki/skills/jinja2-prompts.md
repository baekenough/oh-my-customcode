---
title: Jinja2 Prompts
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/jinja2-prompts/SKILL.md
related:
  - [[reasoning-sandwich]]
  - [[evaluator-optimizer]]
---

# Jinja2 Prompts

Parameterized prompt templates using Jinja2 syntax for reusable agent instructions.

## Overview

Provides a Jinja2-based templating system for agent prompts. Templates support variable substitution, conditionals, loops, and filters for constructing dynamic, reusable prompt patterns. Used internally by skills that need to generate parameterized prompts (e.g., evaluator-optimizer, reasoning-sandwich). Templates are stored alongside the skill definition.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: various agents that use parameterized prompts
- **Related skills**: [[reasoning-sandwich]], [[evaluator-optimizer]]
- **See also**: [[R006]]

## Sources

- `.claude/skills/jinja2-prompts/SKILL.md` — skill definition
