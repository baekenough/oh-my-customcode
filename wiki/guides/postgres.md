---
title: "PostgreSQL Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/postgres/README.md
related:
  - [[db-postgres-expert]]
  - [[postgres-best-practices]]
---

# PostgreSQL Guide

Reference documentation for pure PostgreSQL database administration, query optimization, and PG-specific SQL patterns.

## Overview

Covers PostgreSQL-specific SQL features beyond ANSI SQL (UPSERT, RETURNING, DISTINCT ON, LATERAL, FILTER, JSONB operators, recursive CTEs), query optimization, indexing strategies, partitioning, replication, vacuum maintenance, and extensions. Distinct from the Supabase guide — use this for vanilla PostgreSQL projects. Used by `db-postgres-expert`.

## Key Topics

- PG-specific SQL: `INSERT ... ON CONFLICT`, `RETURNING`, `DISTINCT ON`, `LATERAL`
- Indexing: B-tree, GIN (JSONB/arrays), GiST (geometry/full-text), BRIN (time-series)
- Partitioning: range, list, hash partitioning strategies
- Query planner and `EXPLAIN ANALYZE` interpretation
- Vacuum, autovacuum tuning, and bloat management
- Replication: streaming, logical, pg_basebackup
- Extensions: `pg_stat_statements`, `pg_partman`, `PostGIS`

## Relationships

- **Used by agents**: [[db-postgres-expert]]
- **Related skills**: [[postgres-best-practices]]
- **See also**: [[supabase-postgres]], [[alembic]], [[redis]]

## Sources

- `guides/postgres/README.md` — PG SQL quick reference, categories, agent scope comparison
