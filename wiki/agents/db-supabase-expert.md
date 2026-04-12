---
title: db-supabase-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/db-supabase-expert.md
related:
  - [[db-postgres-expert]]
  - [[db-alembic-expert]]
  - [[fe-vercel-agent]]
---

# db-supabase-expert

Supabase and PostgreSQL expert for schema design, query optimization, Row-Level Security (RLS) configuration, connection pooling, and Supabase-specific features in production applications.

## Overview

`db-supabase-expert` is the go-to agent for Supabase projects, handling both the Supabase platform layer and the underlying PostgreSQL database. Key competencies include schema design with proper normalization and indexing, query optimization with `EXPLAIN`, multi-tenant RLS policy design, PgBouncer connection pooling, migration strategies, and monitoring with `pg_stat_statements`.

Uses `supabase-postgres-best-practices` skill and consults `guides/supabase-postgres/`. Memory is `user`-scoped for cross-project Supabase knowledge.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `supabase-postgres-best-practices`
- **Memory**: user (cross-project Supabase knowledge)
- **Effort**: high

## Relationships

- **Depends on**: `supabase-postgres-best-practices` skill, `guides/supabase-postgres/`
- **Used by**: `dev-lead-routing` skill (Supabase/database task routing), R010 delegation table (database schema changes)
- **See also**: [[db-postgres-expert]] (pure PostgreSQL without Supabase), [[db-alembic-expert]] (migration management), [[fe-vercel-agent]] (Supabase + Next.js frontend)

## Sources

- `.claude/agents/db-supabase-expert.md` — agent definition
