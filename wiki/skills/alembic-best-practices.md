---
title: Alembic Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/alembic-best-practices/SKILL.md
related:
  - [[db-alembic-expert]]
  - [[postgres-best-practices]]
  - [[fastapi-best-practices]]
---

# Alembic Best Practices

Alembic migration patterns for naming conventions, safety checks, expand-contract, env.py configuration, and CI integration.

## Overview

Reference patterns for safe Alembic migrations: naming convention enforcement via `MetaData`, credential management via environment variables, autogenerate trust matrix (what it detects vs. misses), dangerous pattern detection checklist, expand-contract pattern for zero-downtime changes, async `env.py` configuration for asyncpg, pytest-alembic testing, and CI integration with Squawk lint. Used by `db-alembic-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[db-alembic-expert]]
- **Related skills**: [[postgres-best-practices]], [[fastapi-best-practices]], [[python-best-practices]]
- **See also**: guides/alembic-best-practices/

## Sources

- `.claude/skills/alembic-best-practices/SKILL.md` — skill definition
