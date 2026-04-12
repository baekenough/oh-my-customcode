---
title: Dev Refactor
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/dev-refactor/SKILL.md
related:
  - [[dev-review]]
  - [[structured-dev-cycle]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-typescript-expert]]
---

# Dev Refactor

Refactor code for better structure and patterns.

## Overview

Routes refactoring work to the language-specific expert agent. Runs pre-flight guards before refactoring: test coverage check (WARN if missing), rename-only detection (suggests IDE rename instead), formatting-only detection (suggests formatter), and file move detection (suggests `git mv`). Supports `--spec` flag to preserve canonical invariants. Detects language from file extensions and selects the appropriate expert.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/dev-refactor`
- **Effort**: not specified
- **Argument hint**: `<file-or-directory> [--lang <language>] [--spec]`

## Relationships

- **Used by agents**: [[lang-golang-expert]], [[lang-python-expert]], [[lang-typescript-expert]], [[lang-rust-expert]], [[lang-kotlin-expert]]
- **Related skills**: [[dev-review]], [[structured-dev-cycle]], [[omcustom-takeover]]
- **See also**: [[R010]]

## Sources

- `.claude/skills/dev-refactor/SKILL.md` — skill definition
