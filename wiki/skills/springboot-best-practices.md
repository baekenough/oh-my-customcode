---
title: Spring Boot Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/springboot-best-practices/SKILL.md
related:
  - [[be-springboot-expert]]
  - [[kotlin-best-practices]]
  - [[java21-best-practices]]
---

# Spring Boot Best Practices

Spring Boot patterns for enterprise Java applications.

## Overview

Reference patterns for Spring Boot: layered architecture (controller/service/repository/model/dto/config/exception), constructor injection with `@RequiredArgsConstructor`, `@RestController` + `@RequestMapping`, `@Transactional` at service level, Spring Data JPA, `@RestControllerAdvice` for global exception handling, profile-based YAML configuration, Spring Security with `SecurityFilterChain`, and `@WebMvcTest`/`@DataJpaTest`/`@SpringBootTest` testing. Used by `be-springboot-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[be-springboot-expert]]
- **Related skills**: [[kotlin-best-practices]], [[java21-best-practices]], [[postgres-best-practices]]
- **See also**: guides/springboot-best-practices/

## Sources

- `.claude/skills/springboot-best-practices/SKILL.md` — skill definition
