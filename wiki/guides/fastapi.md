---
title: "FastAPI Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/fastapi/best-practices.md
related:
  - [[be-fastapi-expert]]
  - [[fastapi-best-practices]]
---

# FastAPI Guide

Reference documentation for FastAPI high-performance Python web API patterns and best practices.

## Overview

Covers domain-driven project structure, async/sync I/O patterns, dependency injection, Pydantic schema design, error handling, database session management, and background task patterns. Based on official FastAPI documentation and production community patterns. Used by `be-fastapi-expert` for Python API development.

## Key Topics

- Domain-based project structure (router, schemas, models, service, dependencies)
- Async best practices: `async def` for I/O, `def` for sync ops offloaded to threadpool
- CPU-intensive tasks with Celery/worker processes
- Dependency injection patterns and reusable dependencies
- Pydantic v2 schema design and validation
- Global exception handlers and HTTP error responses
- Database session lifecycle with SQLAlchemy async

## Relationships

- **Used by agents**: [[be-fastapi-expert]]
- **Related skills**: [[fastapi-best-practices]]
- **See also**: [[python]], [[alembic]], [[postgres]], [[django-best-practices]]

## Sources

- `guides/fastapi/best-practices.md` — project structure, async patterns, dependency injection
