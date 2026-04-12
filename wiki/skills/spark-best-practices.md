---
title: Spark Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/spark-best-practices/SKILL.md
related:
  - [[de-spark-expert]]
  - [[kafka-best-practices]]
  - [[airflow-best-practices]]
---

# Spark Best Practices

Apache Spark best practices for PySpark and Scala distributed data processing.

## Overview

Reference patterns for Apache Spark: broadcast joins for small-large table joins, shuffle minimization, DataFrame caching with appropriate storage levels, executor configuration (cores, memory, dynamic allocation), optimal partition sizing (100-200MB), Pandas UDFs for vectorized operations over Python UDFs, and columnar storage formats (Parquet, Delta, Iceberg). Used by `de-spark-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[de-spark-expert]]
- **Related skills**: [[kafka-best-practices]], [[airflow-best-practices]], [[pipeline-architecture-patterns]]
- **See also**: guides/spark-best-practices/

## Sources

- `.claude/skills/spark-best-practices/SKILL.md` — skill definition
