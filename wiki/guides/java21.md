---
title: "Java 21 Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/java21/java-style-guide.md
related:
  - [[lang-java21-expert]]
  - [[java21-best-practices]]
---

# Java 21 Guide

Reference documentation for modern Java 21 language features, coding conventions, and production patterns.

## Overview

Covers Java 21 LTS features including Virtual Threads (Project Loom), Records, Sealed Classes, Pattern Matching, and Text Blocks. Also includes Google Java Style Guide conventions for formatting, naming, and import ordering. Used by `lang-java21-expert` for Java language tasks and `be-springboot-expert` for Spring Boot applications.

## Key Topics

- Java 21 features: Virtual Threads, Records, Sealed Classes, Pattern Matching for switch
- Google Java Style Guide: 2-space indentation, import ordering, naming conventions
- Naming: `UpperCamelCase` classes, `lowerCamelCase` methods/vars, `UPPER_SNAKE_CASE` constants
- Structured concurrency with Virtual Threads
- `SequencedCollection` and new collection methods
- Modern stream and collector patterns

## Relationships

- **Used by agents**: [[lang-java21-expert]], [[be-springboot-expert]]
- **Related skills**: [[java21-best-practices]]
- **See also**: [[kotlin]], [[springboot]]

## Sources

- `guides/java21/java-style-guide.md` — style guide, naming conventions, formatting rules
