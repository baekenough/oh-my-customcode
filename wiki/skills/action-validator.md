---
title: Action Validator
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/action-validator/SKILL.md
related:
  - [[pipeline-guards]]
  - [[adversarial-review]]
  - [[R002]]
  - [[R021]]
---

# Action Validator

Pre-action boundary checking — validates agent tool calls against declared capabilities and task contracts.

## Overview

Advisory pre-action validation layer that checks agent tool calls against declared capabilities, file access scope (R002), and task contracts before execution. Inspired by AutoHarness (Google DeepMind). Does NOT block actions (R021 advisory-first model) — emits warnings when agents attempt operations outside their declared scope.

Validation checks include: tool scope vs agent's `tools` frontmatter, file paths vs R002 access rules, domain scope vs agent's `domain` frontmatter, and task contract vs operation type.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-sauron]], pipeline hooks
- **Related skills**: [[pipeline-guards]], [[adversarial-review]]
- **See also**: [[R002]], [[R010]], [[R021]]

## Sources

- `.claude/skills/action-validator/SKILL.md` — skill definition
