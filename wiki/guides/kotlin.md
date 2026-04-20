---
title: "Kotlin Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/kotlin/coding-conventions.md
related:
  - [[lang-kotlin-expert]]
  - [[kotlin-best-practices]]
---

# Kotlin Guide

Reference documentation for idiomatic Kotlin coding conventions and language patterns.

## Overview

Covers official Kotlin coding conventions including naming rules, class layout, extension functions, coroutines, null safety patterns, and functional idioms. Based on kotlinlang.org official style guide. Used by `lang-kotlin-expert` for Kotlin language tasks and `be-springboot-expert` when Kotlin is the Spring implementation language.

## Key Topics

- Source file organization and class layout order (properties → constructors → methods → companion)
- Naming conventions: `UpperCamelCase` classes, `lowerCamelCase` functions, `UPPER_SNAKE_CASE` constants
- Extension functions and property delegation patterns
- Coroutines: `suspend`, `Flow`, structured concurrency
- Null safety: safe calls, Elvis operator, `requireNotNull`
- Data classes, sealed classes, and when expressions
- Scope functions: `let`, `run`, `apply`, `also`, `with`

## Relationships

- **Used by agents**: [[lang-kotlin-expert]], [[be-springboot-expert]]
- **Related skills**: [[kotlin-best-practices]]
- **See also**: [[java]], [[springboot]]

## Sources

- `guides/kotlin/coding-conventions.md` — naming, class layout, formatting conventions
