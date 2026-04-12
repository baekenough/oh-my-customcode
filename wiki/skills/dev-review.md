---
title: Dev Review
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/dev-review/SKILL.md
related:
  - [[dev-refactor]]
  - [[adversarial-review]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-typescript-expert]]
---

# Dev Review

Review code against language-specific best practices.

## Overview

Routes code review to the language-specific expert agent. Runs pre-flight guards: auto-generated code detection (WARN), formatting-only changes detection (INFO), single syntax error detection (INFO), and linter availability check (INFO). Selects the appropriate expert based on file extensions. Optionally persists findings to `.claude/outputs/sessions/`. Complements `adversarial-review` with best-practices coverage.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/dev-review`
- **Effort**: not specified
- **Argument hint**: `<file-or-directory> [--lang <language>]`

## Relationships

- **Used by agents**: [[lang-golang-expert]], [[lang-python-expert]], [[lang-typescript-expert]], [[lang-rust-expert]], [[lang-kotlin-expert]], [[be-springboot-expert]], [[fe-vercel-agent]]
- **Related skills**: [[dev-refactor]], [[adversarial-review]]
- **See also**: [[R010]]

## Sources

- `.claude/skills/dev-review/SKILL.md` — skill definition
