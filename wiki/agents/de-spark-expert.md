---
title: de-spark-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/de-spark-expert.md
related:
  - [[de-kafka-expert]]
  - [[de-pipeline-expert]]
  - [[de-snowflake-expert]]
---

# de-spark-expert

Expert Apache Spark 4.x developer for PySpark and Scala distributed data processing, Structured Streaming, and storage format optimization.

## Overview

`de-spark-expert` builds high-performance distributed Spark jobs for large-scale data transformation, targeting Apache Spark 4.x. It uses DataFrame/Dataset APIs and Spark SQL, applies broadcast joins and hint-based optimization, designs partitioning and bucketing strategies, implements Structured Streaming applications, manages resource allocation (executor/driver memory, dynamic allocation), optimizes storage formats (Parquet, ORC, Delta, Iceberg), and profiles jobs using Spark UI.

Spark 4.0 introduces two capabilities the agent is scoped around: **Spark Connect**, a decoupled client-server protocol for remote/thin-client Spark sessions, and **ANSI mode enabled by default**, which enforces stricter SQL semantics (type coercion, overflow errors) than earlier Spark versions. The agent applies ANSI-mode-compliant SQL patterns rather than legacy permissive-mode assumptions.

Uses `spark-best-practices` skill and `guides/spark/` for reference.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `spark-best-practices`
- **Memory**: local (`.claude/agent-memory-local/de-spark-expert/`, git-untracked)
- **Effort**: high
- **Permission mode**: bypassPermissions

## Relationships

- **Depends on**: `spark-best-practices` skill, `guides/spark/`
- **Used by**: `de-lead-routing` skill (Spark/distributed processing task routing), [[de-pipeline-expert]] (pipeline architecture)
- **See also**: [[de-kafka-expert]] (streaming data source), [[de-snowflake-expert]] (Iceberg target), [[de-pipeline-expert]] (overall architecture)

## Sources

- `.claude/agents/de-spark-expert.md` — agent definition
