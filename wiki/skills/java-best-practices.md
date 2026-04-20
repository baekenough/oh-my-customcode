---
title: Java Best Practices
type: skill
updated: 2026-04-20
sources:
  - .claude/skills/java-best-practices/SKILL.md
related:
  - [[lang-java-expert]]
  - [[springboot-best-practices]]
---

# Java Best Practices

Modern Java 25 LTS patterns from Virtual Threads, Pattern Matching, Records, and Sealed Classes.

## Overview

Reference patterns for Java 25 LTS: Virtual Threads (JEP 444) for high-concurrency I/O via `Executors.newVirtualThreadPerTaskExecutor()`, Records (JEP 395) for immutable data carriers with compact constructors, Sealed Classes (JEP 409) for exhaustive pattern matching, Record Patterns (JEP 440) for deconstruction in switch and instanceof, Sequenced Collections (JEP 431) with `getFirst()`/`getLast()`, and text blocks with `String.formatted()`. Covers Google Java Style Guide naming rules and error handling patterns. Updated from `java21-best-practices` to track Java 25 LTS. Used by [[lang-java-expert]].

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[lang-java-expert]]
- **Related skills**: [[springboot-best-practices]]
- **See also**: [guides/java/](../guides/java.md)

## Sources

- `.claude/skills/java-best-practices/SKILL.md` — skill definition
- [guides/java/modern-java.md](../../guides/java/modern-java.md) — JEP feature reference
- [guides/java/java-style-guide.md](../../guides/java/java-style-guide.md) — naming and formatting
