---
title: "Supabase PostgreSQL Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/supabase-postgres/README.md
related:
  - [[db-supabase-expert]]
  - [[supabase-postgres-best-practices]]
---

# Supabase PostgreSQL Guide

Reference documentation for PostgreSQL best practices in Supabase projects, based on supabase/agent-skills.

## Overview

Covers Supabase-specific PostgreSQL patterns: Row Level Security (RLS) policies, Edge Functions integration, connection pooling with PgBouncer, query performance optimization, schema design for multi-tenant apps, concurrency and locking strategies, and monitoring with `pg_stat_*` views. Distinct from the pure PostgreSQL guide — use this for Supabase-hosted projects. Used by `db-supabase-expert`.

## Key Topics

- Row Level Security (RLS): `CREATE POLICY`, `auth.uid()`, role-based policies
- Connection management: PgBouncer transaction mode, connection limits
- Query performance: indexes, `EXPLAIN ANALYZE`, `pg_stat_statements`
- Schema design for Supabase: `public` schema conventions, foreign keys
- Concurrency: advisory locks, `SELECT FOR UPDATE SKIP LOCKED`
- Edge Functions and `postgres.js` / `supabase-js` client patterns
- Monitoring with Supabase Dashboard and `pg_stat_activity`

## Relationships

- **Used by agents**: [[db-supabase-expert]]
- **Related skills**: [[supabase-postgres-best-practices]]
- **See also**: [[postgres]], [[alembic]], [[redis]]

## Sources

- `guides/supabase-postgres/README.md` — categories, agent scope, external resources
