---
title: de-airflow-expert
type: agent
updated: 2026-04-18
sources:
  - .claude/agents/de-airflow-expert.md
related:
  - [[de-pipeline-expert]]
  - [[de-dbt-expert]]
  - [[de-spark-expert]]
---

# de-airflow-expert

Expert Apache Airflow developer for DAG authoring, testing, debugging, scheduling patterns, and pipeline orchestration in production environments.

## Overview

`de-airflow-expert` specializes in building production-quality Airflow DAGs following official best practices. Core expertise includes top-level code avoidance (for DAG parsing performance), TaskFlow API and classic operators, complex task dependency design, data-aware scheduling with timetables, DAG unit testing, connection/variable management, and secret backend integration.

Uses `airflow-best-practices` skill and `guides/airflow/` for reference documentation.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `airflow-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `airflow-best-practices` skill, `guides/airflow/`
- **Used by**: `de-lead-routing` skill (Airflow/orchestration task routing), [[de-pipeline-expert]] (cross-tool pipeline design)
- **See also**: [[de-dbt-expert]] (dbt transformation tasks), [[de-spark-expert]] (Spark compute tasks), [[de-pipeline-expert]] (overall pipeline architecture)

## Sources

- `.claude/agents/de-airflow-expert.md` — agent definition
