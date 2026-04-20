---
title: lang-kotlin-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/lang-kotlin-expert.md
related:
  - [[be-springboot-expert]]
  - [[lang-java-expert]]
  - [[fe-flutter-agent]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-rust-expert]]
  - [[lang-typescript-expert]]
---

# lang-kotlin-expert

Expert Kotlin developer for writing idiomatic, concise, null-safe Kotlin code following JetBrains official conventions, with support for coroutines, Android, and Kotlin Multiplatform.

## Overview

`lang-kotlin-expert` handles Kotlin language work across all targets — JVM (Android, Spring Boot), Multiplatform, and native. Expertise includes writing idiomatically null-safe code, designing type-safe APIs leveraging Kotlin's type system, functional programming with higher-order functions and extension functions, coroutines for async programming, and applying Kotlin-specific design patterns (sealed classes, data classes, object declarations).

Uses `kotlin-best-practices` skill and `guides/kotlin/`.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `kotlin-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `kotlin-best-practices` skill, `guides/kotlin/`
- **Used by**: `dev-lead-routing` skill (Kotlin task routing), R010 delegation table ("Kotlin/Spring")
- **See also**: [[be-springboot-expert]] (Kotlin + Spring Boot), [[lang-java-expert]] (Java alternative), [[fe-flutter-agent]] (Dart/Flutter for mobile), [[lang-golang-expert]], [[lang-python-expert]], [[lang-rust-expert]], [[lang-typescript-expert]]

## Sources

- `.claude/agents/lang-kotlin-expert.md` — agent definition
