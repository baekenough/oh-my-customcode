---
title: Go Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/go-best-practices/SKILL.md
related:
  - [[lang-golang-expert]]
  - [[go-backend-best-practices]]
---

# Go Best Practices

Idiomatic Go patterns from Effective Go and the Uber style guide.

## Overview

Reference patterns for idiomatic Go: naming conventions (exported identifiers, acronyms), error handling (`fmt.Errorf` with `%w`, sentinel errors), interface design (small interfaces, accept interfaces/return structs), goroutine patterns (always know when they stop), channel idioms, package organization, and testing with table-driven tests. Used by `lang-golang-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[lang-golang-expert]]
- **Related skills**: [[go-backend-best-practices]]
- **See also**: guides/golang/

## Sources

- `.claude/skills/go-best-practices/SKILL.md` — skill definition
