---
title: PostgreSQL Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/postgres-best-practices/SKILL.md
related:
  - [[db-postgres-expert]]
  - [[supabase-postgres-best-practices]]
  - [[alembic-best-practices]]
---

# PostgreSQL Best Practices

PostgreSQL best practices for database design, query optimization, and performance tuning.

## Overview

Reference patterns for PostgreSQL: EXPLAIN ANALYZE usage, index types (B-tree, GIN, GiST, BRIN, partial, covering), table partitioning (range, list, hash), connection pooling with pgBouncer, VACUUM/AUTOVACUUM tuning, locking strategies (concurrent index creation), replication setup, and monitoring via pg_stat views. Used by `db-postgres-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[db-postgres-expert]]
- **Related skills**: [[supabase-postgres-best-practices]], [[alembic-best-practices]]
- **See also**: guides/postgres-best-practices/

## Sources

- `.claude/skills/postgres-best-practices/SKILL.md` — skill definition
