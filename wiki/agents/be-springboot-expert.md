---
title: be-springboot-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/be-springboot-expert.md
related:
  - [[lang-kotlin-expert]]
  - [[lang-java-expert]]
  - [[db-postgres-expert]]
---

# be-springboot-expert

Expert Spring Boot 3.5.x developer for enterprise-grade Java 21 and Kotlin applications, covering RESTful APIs, microservices, Spring Data, security patterns, virtual threads, and GraalVM native images.

## Overview

`be-springboot-expert` targets modern Spring Boot development with Java 21 and Kotlin. Key capabilities include annotation-driven architecture (`@Service`, `@Repository`, `@RestController`, `@ControllerAdvice`), virtual threads (JEP 444) for high-concurrency scenarios, GraalVM native image compilation for optimized startup, Micrometer-based observability, and Spring Security patterns.

Uses the `springboot-best-practices` skill and consults `guides/springboot/` for reference.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `springboot-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `springboot-best-practices` skill, `guides/springboot/`
- **Used by**: `dev-lead-routing` skill (Java/Kotlin backend task routing)
- **See also**: [[lang-java-expert]] (Java 21 features), [[lang-kotlin-expert]] (Kotlin patterns), [[db-postgres-expert]] (database layer)

## Sources

- `.claude/agents/be-springboot-expert.md` — agent definition
