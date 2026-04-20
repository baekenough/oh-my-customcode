---
title: "Java Guide"
type: guide
updated: 2026-04-20
sources:
  - guides/java/index.yaml
  - guides/java/modern-java.md
  - guides/java/java-style-guide.md
related:
  - [[lang-java-expert]]
  - [[java-best-practices]]
  - [[be-springboot-expert]]
  - [[lang-kotlin-expert]]
---

# Java Guide

Reference documentation for modern Java 25 LTS language features, coding conventions, and production patterns.

## Overview

Covers Java 25 LTS features including Virtual Threads (Project Loom, JEP 444), Records (JEP 395), Sealed Classes (JEP 409), Pattern Matching for switch (JEP 441) and instanceof, Record Patterns (JEP 440), Sequenced Collections (JEP 431), and Text Blocks. Also includes Google Java Style Guide conventions for formatting, naming, and import ordering. Used by `lang-java-expert` for Java language tasks and `be-springboot-expert` for Spring Boot applications. Updated from the former `java21` guide to track Java 25 LTS.

## Key Topics

- Java 25 LTS: Virtual Threads, Records, Sealed Classes, Pattern Matching for switch
- Google Java Style Guide: 2-space indentation, import ordering, naming conventions
- Naming: `UpperCamelCase` classes, `lowerCamelCase` methods/vars, `UPPER_SNAKE_CASE` constants
- Structured concurrency with `StructuredTaskScope`
- `SequencedCollection` with `getFirst()`/`getLast()`/`reversed()`
- Anti-patterns: pooling Virtual Threads, `synchronized` blocks in Virtual Thread code

## Relationships

- **Used by agents**: [[lang-java-expert]], [[be-springboot-expert]]
- **Related skills**: [[java-best-practices]]
- **See also**: [[kotlin]], [[springboot]]

## Sources

- `guides/java/modern-java.md` — Java 25 LTS modern features and JEP reference
- `guides/java/java-style-guide.md` — style guide, naming conventions, formatting rules
- [Oracle Java 25 Docs](https://docs.oracle.com/en/java/javase/25/)
- [OpenJDK JEP 444 — Virtual Threads](https://openjdk.org/jeps/444)
