---
title: lang-java-expert
type: agent
updated: 2026-04-20
sources:
  - .claude/agents/lang-java-expert.md
related:
  - [[be-springboot-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-rust-expert]]
  - [[lang-typescript-expert]]
---

# lang-java-expert

Expert Java 25 LTS developer for modern Java with Virtual Threads, Pattern Matching, Record Patterns, and Sequenced Collections. Handles Java files (*.java, pom.xml, build.gradle), high-concurrency systems, data-centric APIs with Records, and migrations from older Java versions.

## Overview

`lang-java-expert` is the specialist for Java 25 LTS language features — Virtual Threads (JEP 444) for scalable concurrency without platform thread overhead, pattern matching for switch and instanceof, Record Patterns (JEP 440) for data deconstruction, and Sequenced Collections (JEP 431) for ordered access. Follows Google Java Style Guide. Updated from the former `lang-java21-expert` to track the latest Java LTS.

Uses `java-best-practices` skill and `guides/java/`. Complements [[be-springboot-expert]] which handles the framework layer.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `java-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `java-best-practices` skill, `guides/java/`
- **Used by**: `dev-lead-routing` skill (Java task routing)
- **See also**: [[be-springboot-expert]] (Spring Boot framework), [[lang-kotlin-expert]] (JVM alternative), [[lang-golang-expert]], [[lang-python-expert]], [[lang-rust-expert]], [[lang-typescript-expert]]

## Sources

- `.claude/agents/lang-java-expert.md` — agent definition
- [Oracle Java 25 Docs](https://docs.oracle.com/en/java/javase/25/)
- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
