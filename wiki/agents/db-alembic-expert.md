---
title: db-alembic-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/db-alembic-expert.md
related:
  - [[db-postgres-expert]]
  - [[be-fastapi-expert]]
  - [[qa-engineer]]
---

# db-alembic-expert

Alembic migration lifecycle specialist for generating, reviewing, fixing, and advising on SQLAlchemy database migrations with a focus on safety and zero-downtime deployment.

## Overview

`db-alembic-expert` manages the complete Alembic migration lifecycle. It autogenerates migrations from SQLAlchemy models, performs post-generation safety reviews (detecting rename-as-drop+add, anonymous constraints, lock-risky operations), implements the Expand-Contract pattern for zero-downtime schema changes, configures `env.py` for async/multi-tenant setups, and integrates migrations into CI pipelines with pytest-alembic and Squawk linter.

Escalates from sonnet to opus after 2 failures (escalation policy enabled).

## Key Details

- **Model**: sonnet (escalates to opus after 2 failures)
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `alembic-best-practices`, `postgres-best-practices`
- **Memory**: project
- **Effort**: high
- **Limitations**: cannot apply migrations directly to production databases; cannot detect rename intent without explicit instruction

## Safety Rules

- Never auto-fix column renames without explicit user confirmation
- Always flag missing `downgrade()` logic
- Never embed credentials in `alembic.ini` or `env.py`
- Require `CONCURRENTLY` for index operations on large tables

## Relationships

- **Depends on**: `alembic-best-practices` skill, `postgres-best-practices` skill
- **Used by**: `dev-lead-routing` skill (database migration tasks)
- **See also**: [[db-postgres-expert]] (PostgreSQL DDL nuances), [[be-fastapi-expert]] (async engine configuration), [[qa-engineer]] (migration test strategy)

## Sources

- `.claude/agents/db-alembic-expert.md` — agent definition
