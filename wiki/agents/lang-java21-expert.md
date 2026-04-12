---
title: lang-java21-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/lang-java21-expert.md
related:
  - [[be-springboot-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-rust-expert]]
  - [[lang-typescript-expert]]
---

# lang-java21-expert

Expert Java 21 developer for modern Java with Virtual Threads (JEP 444), Pattern Matching for switch, Record Patterns (JEP 440), Sequenced Collections (JEP 431), and legacy Java migration.

## Overview

`lang-java21-expert` is the specialist for modern Java 21 language features — not general Java, but specifically the new capabilities introduced in recent LTS releases. It applies Virtual Threads for scalable concurrency without platform thread overhead, pattern matching for cleaner switch expressions and instanceof checks, record patterns for data deconstruction, and sequenced collections for ordered data structures. Follows Google Java Style Guide.

Uses `java21-best-practices` skill and `guides/java21/`. Complements [[be-springboot-expert]] which handles the framework layer.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `java21-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `java21-best-practices` skill, `guides/java21/`
- **Used by**: `dev-lead-routing` skill (Java task routing)
- **See also**: [[be-springboot-expert]] (Spring Boot framework), [[lang-kotlin-expert]] (JVM alternative), [[lang-golang-expert]], [[lang-python-expert]], [[lang-rust-expert]], [[lang-typescript-expert]]

## Sources

- `.claude/agents/lang-java21-expert.md` — agent definition
