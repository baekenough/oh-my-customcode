---
title: db-alembic-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/db-alembic-expert.md
related:
  - [[db-postgres-expert]]
  - [[db-supabase-expert]]
  - [[be-fastapi-expert]]
  - [[qa-engineer]]
---

# db-alembic-expert

Alembic migration lifecycle specialist for generating, reviewing, fixing, and advising on SQLAlchemy database migrations with a focus on safety and zero-downtime deployment.

## Overview

`db-alembic-expert` manages the complete Alembic migration lifecycle. It autogenerates migrations from SQLAlchemy models, performs post-generation safety reviews (detecting rename-as-drop+add, anonymous constraints, lock-risky operations), implements the Expand-Contract pattern for zero-downtime schema changes, configures `env.py` for async/multi-tenant setups, manages PostgreSQL-specific objects (views, functions, triggers, RLS policies) via alembic-utils, and integrates migrations into CI pipelines with pytest-alembic and the Squawk linter.

## Key Details

- **Model**: claude-opus-5
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `alembic-best-practices`, `postgres-best-practices`
- **Memory**: local
- **Effort**: high
- **Limitations**: cannot apply migrations directly to production databases; cannot resolve application-level data backfill logic without domain context; cannot detect rename intent without git diff context or explicit user instruction

## Safety Rules

- Never auto-fix column renames without explicit user confirmation — autogenerate cannot distinguish rename from drop+add
- Always flag missing `downgrade()` logic (`pass` acceptable only when explicitly justified)
- Never embed credentials in `alembic.ini` or `env.py` — source from `os.environ`
- Require `CONCURRENTLY` for index operations on large tables

## Relationships

- **Depends on**: `alembic-best-practices` skill, `postgres-best-practices` skill
- **Used by**: `dev-lead-routing` skill (database migration tasks)
- **See also**: [[db-postgres-expert]] (PostgreSQL DDL nuances, partitioning, JSONB), [[db-supabase-expert]] (Supabase schema management), [[be-fastapi-expert]] (async engine configuration, lifespan integration), [[qa-engineer]] (migration test strategy, rollback testing)

## Sources

- `.claude/agents/db-alembic-expert.md` — agent definition
