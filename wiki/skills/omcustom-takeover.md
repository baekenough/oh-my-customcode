---
title: Omcustom Takeover
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-takeover/SKILL.md
related:
  - [[dev-refactor]]
  - [[mgr-creator]]
  - [[arch-speckit-agent]]
---

# Omcustom Takeover

Extract canonical spec from existing agents/skills — reverse-engineer the intended contract.

## Overview

Analyzes an existing agent or skill and extracts a canonical specification document (`spec.md`) describing its intended behavior, invariants, inputs/outputs, and constraints. The spec is saved to `.claude/specs/<name>.spec.md` and can be used by `dev-refactor --spec` to validate refactoring doesn't break the contract. Used to formalize knowledge embedded in existing code.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom-takeover`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dev-refactor]], [[arch-speckit-agent]]
- **See also**: [[mgr-creator]], [[R006]]

## Sources

- `.claude/skills/omcustom-takeover/SKILL.md` — skill definition
