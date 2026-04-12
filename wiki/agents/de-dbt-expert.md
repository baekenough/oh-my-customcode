---
title: de-dbt-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/de-dbt-expert.md
related:
  - [[de-airflow-expert]]
  - [[de-snowflake-expert]]
  - [[de-pipeline-expert]]
  - [[db-postgres-expert]]
---

# de-dbt-expert

Expert dbt developer for analytics engineering, SQL modeling, testing, and documentation following dbt Labs official patterns.

## Overview

`de-dbt-expert` covers the complete dbt analytics engineering workflow. It structures projects with the staging/intermediate/marts layering (stg_, int_, fct_, dim_ prefixes), selects appropriate materializations (view, ephemeral, table, incremental), writes schema tests (unique, not_null, relationships, accepted_values), builds DRY SQL with Jinja macros, and manages sources, seeds, snapshots, and documentation.

Uses `dbt-best-practices` skill and `guides/dbt/` for reference.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `dbt-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `dbt-best-practices` skill, `guides/dbt/`
- **Used by**: `de-lead-routing` skill (dbt/analytics task routing), [[de-pipeline-expert]] (cross-tool pipeline design)
- **See also**: [[de-airflow-expert]] (orchestration of dbt runs), [[de-snowflake-expert]] (Snowflake as dbt target), [[db-postgres-expert]] (PostgreSQL as dbt target)

## Sources

- `.claude/agents/de-dbt-expert.md` — agent definition
