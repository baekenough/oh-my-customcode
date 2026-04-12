---
title: de-snowflake-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/de-snowflake-expert.md
related:
  - [[de-dbt-expert]]
  - [[de-pipeline-expert]]
  - [[de-spark-expert]]
---

# de-snowflake-expert

Expert Snowflake developer for cloud data warehouse design, query optimization, data loading, and scalable data platforms including native Iceberg table support.

## Overview

`de-snowflake-expert` handles Snowflake's cloud data warehouse layer end-to-end. It configures virtual warehouses (sizing, auto-scaling, multi-cluster), optimizes queries with clustering keys and micro-partition pruning, implements data loading strategies (COPY INTO, Snowpipe, external stages), leverages result caching and materialized views, uses zero-copy cloning for dev/test environments, manages secure data sharing, and integrates native Iceberg tables.

Uses `snowflake-best-practices` skill and consults `guides/snowflake/` and `guides/iceberg/`.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `snowflake-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `snowflake-best-practices` skill, `guides/snowflake/`, `guides/iceberg/`
- **Used by**: `de-lead-routing` skill (Snowflake task routing), [[de-pipeline-expert]] (pipeline architecture)
- **See also**: [[de-dbt-expert]] (SQL transformations on Snowflake), [[de-spark-expert]] (Iceberg with Spark)

## Sources

- `.claude/agents/de-snowflake-expert.md` — agent definition
