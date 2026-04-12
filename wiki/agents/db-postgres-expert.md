---
title: db-postgres-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/db-postgres-expert.md
related:
  - [[db-supabase-expert]]
  - [[db-alembic-expert]]
  - [[db-redis-expert]]
---

# db-postgres-expert

Expert PostgreSQL DBA for pure PostgreSQL environments, covering database design, query optimization, indexing strategies, partitioning, replication, and performance tuning.

## Overview

`db-postgres-expert` is the specialist for vanilla PostgreSQL without Supabase dependency. It covers the full DBA toolkit: advanced indexing (B-tree, GIN, GiST, BRIN, partial, covering), table partitioning (range, list, hash, declarative), streaming/logical replication and HA setup, query tuning with `EXPLAIN ANALYZE` and `pg_stat_statements`, vacuum/autovacuum tuning, and PostgreSQL-specific SQL features.

Uses `postgres-best-practices` skill and `guides/postgres/` for reference. Memory is `user`-scoped for cross-project DBA knowledge retention.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `postgres-best-practices`
- **Memory**: user (cross-project DBA knowledge)
- **Effort**: high

## Supported Extensions

pg_trgm, PostGIS, pgvector, pg_cron, TimescaleDB

## Relationships

- **Depends on**: `postgres-best-practices` skill, `guides/postgres/`
- **Used by**: `dev-lead-routing` skill (database design tasks)
- **See also**: [[db-supabase-expert]] (Supabase + PostgreSQL), [[db-alembic-expert]] (migration management), [[db-redis-expert]] (caching layer)

## Sources

- `.claude/agents/db-postgres-expert.md` — agent definition
