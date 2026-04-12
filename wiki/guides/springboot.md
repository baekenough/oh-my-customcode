---
title: "Spring Boot Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/springboot/best-practices.md
related:
  - [[be-springboot-expert]]
  - [[springboot-best-practices]]
---

# Spring Boot Guide

Reference documentation for Spring Boot enterprise application patterns and production-ready configurations.

## Overview

Covers layered architecture (controller/service/repository/model/dto/config), constructor injection with `@RequiredArgsConstructor`, REST controller design, exception handling with `@RestControllerAdvice`, database configuration with Spring Data JPA, security with Spring Security, and actuator for monitoring. Used by `be-springboot-expert` for Java/Kotlin Spring applications.

## Key Topics

- Project structure: `controller/`, `service/impl/`, `repository/`, `model/`, `dto/`, `config/`
- Constructor injection (preferred over `@Autowired` field injection)
- REST controllers with `@RestController`, `@RequestMapping`, `ResponseEntity`
- Custom exception handling with `@RestControllerAdvice`
- Spring Data JPA: entity design, repository interfaces, query methods
- Spring Security: JWT authentication, method-level security
- Application properties and profile-based configuration

## Relationships

- **Used by agents**: [[be-springboot-expert]]
- **Related skills**: [[springboot-best-practices]]
- **See also**: [[kotlin]], [[java21]], [[postgres]], [[docker]]

## Sources

- `guides/springboot/best-practices.md` — project structure, DI patterns, REST controller design
