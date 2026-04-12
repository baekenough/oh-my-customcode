---
title: de-pipeline-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/de-pipeline-expert.md
related:
  - [[de-airflow-expert]]
  - [[de-dbt-expert]]
  - [[de-kafka-expert]]
  - [[de-spark-expert]]
  - [[de-snowflake-expert]]
---

# de-pipeline-expert

Expert data pipeline architect for ETL/ELT design, orchestration patterns, data quality frameworks, lineage tracking, and cross-tool integration across the modern data stack.

## Overview

`de-pipeline-expert` is the architectural coordinator for complex data pipelines that span multiple tools. It designs batch, streaming, and hybrid (lambda/kappa) architectures, data quality frameworks and contracts, orchestration dependency graphs, data lineage and metadata management, and cost optimization strategies.

Draws on cross-tool expertise across `guides/airflow/`, `guides/dbt/`, `guides/spark/`, `guides/kafka/`, `guides/snowflake/`, and `guides/iceberg/`. Uses the `pipeline-architecture-patterns` skill.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `pipeline-architecture-patterns`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `pipeline-architecture-patterns` skill, multiple data tool guides
- **Used by**: `de-lead-routing` skill (pipeline architecture decisions)
- **See also**: [[de-airflow-expert]] (orchestration), [[de-dbt-expert]] (transformation), [[de-kafka-expert]] (streaming), [[de-spark-expert]] (distributed processing), [[de-snowflake-expert]] (warehouse)

## Sources

- `.claude/agents/de-pipeline-expert.md` — agent definition
