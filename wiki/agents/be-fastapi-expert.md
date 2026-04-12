---
title: be-fastapi-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/be-fastapi-expert.md
related:
  - [[lang-python-expert]]
  - [[be-django-expert]]
  - [[db-alembic-expert]]
  - [[db-postgres-expert]]
---

# be-fastapi-expert

Expert FastAPI developer for building high-performance async Python APIs with Pydantic models, dependency injection, and performance optimization.

## Overview

`be-fastapi-expert` specializes in async Python API development using FastAPI. It designs scalable application architecture with proper async/await patterns, Pydantic v2 models for validation, sophisticated dependency injection systems, and comprehensive error handling. The agent applies the `fastapi-best-practices` skill and references `guides/fastapi/` for authoritative patterns.

Commonly paired with [[db-alembic-expert]] for async SQLAlchemy migrations and [[db-postgres-expert]] for database design.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `fastapi-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `fastapi-best-practices` skill, `guides/fastapi/`
- **Used by**: `dev-lead-routing` skill (FastAPI/Python task routing)
- **See also**: [[lang-python-expert]] (Python language patterns), [[be-django-expert]] (Django alternative), [[db-alembic-expert]] (async migrations), [[db-postgres-expert]] (database layer)

## Sources

- `.claude/agents/be-fastapi-expert.md` — agent definition
