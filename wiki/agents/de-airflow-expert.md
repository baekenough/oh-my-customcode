---
title: de-airflow-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/de-airflow-expert.md
related:
  - [[de-pipeline-expert]]
  - [[de-dbt-expert]]
  - [[de-spark-expert]]
  - [[airflow-best-practices]]
  - [[de-lead-routing]]
---

# de-airflow-expert

Expert Apache Airflow developer for DAG authoring, testing, debugging, scheduling patterns, and pipeline orchestration, targeting **Airflow 3.2.0**.

## Overview

`de-airflow-expert` specializes in building production-ready Airflow 3.x DAGs. Core expertise includes DAG authoring under the `airflow.sdk` namespace (`DAG`, `@task`, `Asset`), TaskFlow API patterns and dynamic task mapping (`expand()`), task dependency design and scheduling (cron, timetables, data-aware with Assets), DAG/task testing (`dag.test()`, unit/integration tests), connection/variable management with secret backend integration, DAG parsing/execution optimization, and Airflow 2.x → 3.x migration guidance (import path changes, deprecated context vars, AIP-72 Task Execution Interface, AIP-44 Internal API).

The agent explicitly tracks the 2.x→3.x divergence: `airflow.models` imports moved to `airflow.sdk`, `Dataset` renamed to `Asset`, `execution_date` context replaced by `dag_run.logical_date`, and the architecture shifted from tight DB coupling to the Task Execution Interface plus an Internal API layer — so migration advice is a first-class capability, not an afterthought.

Uses `airflow-best-practices` skill and `guides/airflow/` for reference documentation.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `airflow-best-practices`
- **Memory**: local
- **Effort**: high
- **Permission mode**: bypassPermissions

## Relationships

- **Depends on**: [[airflow-best-practices]] skill (core Airflow 3.2.0 guidelines), `guides/airflow/` reference docs
- **Used by**: [[de-lead-routing]] skill (Airflow/orchestration task routing), [[de-pipeline-expert]] (cross-tool pipeline design)
- **See also**: [[de-dbt-expert]] (dbt transformation tasks), [[de-spark-expert]] (Spark compute tasks), [[de-pipeline-expert]] (overall pipeline architecture)

## Sources

- `.claude/agents/de-airflow-expert.md` — agent definition
