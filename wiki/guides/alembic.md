---
title: "Alembic Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/alembic/README.md
related:
  - [[db-alembic-expert]]
  - [[alembic-best-practices]]
---

# Alembic Guide

Reference documentation for Alembic, the database migration framework for SQLAlchemy-based Python projects.

## Overview

Alembic manages relational database schema evolution through versioned migration scripts organized as a directed acyclic graph (DAG). It generates Python migration files with `upgrade()` and `downgrade()` functions. Unlike Rails or Django migrations, autogenerate output is a starting point requiring developer review, not a final answer. Used by `db-alembic-expert` for Python/SQLAlchemy projects.

## Key Topics

- Revision chain (DAG) and migration file structure
- `env.py` configuration and `alembic.ini` settings
- CLI reference: `alembic upgrade`, `alembic revision --autogenerate`
- Autogenerate limitations and manual migration patterns
- Branch and merge migrations
- Data migrations alongside schema changes
- Multi-database and async support patterns

## Relationships

- **Used by agents**: [[db-alembic-expert]]
- **Related skills**: [[alembic-best-practices]]
- **See also**: [[postgres]], [[supabase-postgres]], [[python]]

## Sources

- `guides/alembic/README.md` — core concepts, CLI reference, env.py, revision chain
