---
title: Airflow Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/airflow-best-practices/SKILL.md
related:
  - [[de-airflow-expert]]
  - [[dag-orchestration]]
  - [[dbt-best-practices]]
---

# Airflow Best Practices

Apache Airflow best practices for DAG authoring, testing, and production deployment.

## Overview

Reference patterns for writing, testing, and deploying Apache Airflow DAGs. Covers top-level code hygiene (avoid heavy module-level computation), TaskFlow API usage, cron scheduling, unit and integration testing, and production reliability patterns (retries, SLA callbacks, connection pooling). Used by `de-airflow-expert` when authoring or reviewing DAG code.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[de-airflow-expert]]
- **Related skills**: [[dag-orchestration]], [[dbt-best-practices]], [[kafka-best-practices]], [[pipeline-architecture-patterns]]
- **See also**: guides/airflow-best-practices/

## Sources

- `.claude/skills/airflow-best-practices/SKILL.md` — skill definition
