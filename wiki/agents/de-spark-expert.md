---
title: de-spark-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/de-spark-expert.md
related:
  - [[de-kafka-expert]]
  - [[de-pipeline-expert]]
  - [[de-snowflake-expert]]
---

# de-spark-expert

Expert Apache Spark developer for PySpark and Scala distributed data processing, Structured Streaming, and storage format optimization.

## Overview

`de-spark-expert` builds high-performance distributed Spark jobs for large-scale data transformation. It uses DataFrame/Dataset APIs and Spark SQL, applies broadcast joins and hint-based optimization, designs partitioning and bucketing strategies, implements Structured Streaming applications, manages resource allocation (executor/driver memory, dynamic allocation), optimizes storage formats (Parquet, ORC, Delta, Iceberg), and profiles jobs using Spark UI.

Uses `spark-best-practices` skill and `guides/spark/` for reference.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `spark-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `spark-best-practices` skill, `guides/spark/`
- **Used by**: `de-lead-routing` skill (Spark/distributed processing task routing), [[de-pipeline-expert]] (pipeline architecture)
- **See also**: [[de-kafka-expert]] (streaming data source), [[de-snowflake-expert]] (Iceberg target), [[de-pipeline-expert]] (overall architecture)

## Sources

- `.claude/agents/de-spark-expert.md` — agent definition
