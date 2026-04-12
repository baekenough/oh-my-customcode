---
title: Adversarial Review
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/adversarial-review/SKILL.md
related:
  - [[dev-review]]
  - [[sec-codeql-expert]]
  - [[action-validator]]
---

# Adversarial Review

Adversarial code review using attacker mindset — trust boundary, attack surface, business logic, and defense evaluation.

## Overview

Reviews code from an attacker's perspective using STRIDE + OWASP frameworks across four phases: trust boundary analysis, attack surface mapping, business logic review, and defense evaluation. Two depth modes: `quick` (phases 1-2) and `thorough` (all 4 phases with detailed exploitation scenarios). Complements `dev-review` with an attacker perspective.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/adversarial-review`
- **Effort**: not specified
- **Argument hint**: `<file-or-directory> [--depth quick|thorough]`

## Relationships

- **Used by agents**: [[sec-codeql-expert]]
- **Related skills**: [[dev-review]], [[action-validator]]
- **See also**: [[R002]]

## Sources

- `.claude/skills/adversarial-review/SKILL.md` — skill definition
