---
title: "Apache Spark Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/spark/README.md
related:
  - [[de-spark-expert]]
  - [[spark-best-practices]]
---

# Apache Spark Guide

Reference documentation for Apache Spark distributed data processing, performance tuning, and PySpark patterns.

## Overview

Covers Spark performance optimization (partitioning, caching, broadcast joins, shuffle tuning), DataFrame and Dataset API patterns, Structured Streaming for real-time processing, storage format optimization (Parquet, Delta Lake, Iceberg), resource management (executor memory, cores), and testing with `pyspark.testing`. Used by `de-spark-expert` for large-scale data processing.

## Key Topics

- Performance optimization: partitioning strategy, `repartition` vs `coalesce`, caching
- Broadcast joins for small-large table joins
- Shuffle optimization: `spark.sql.shuffle.partitions`, AQE
- Structured Streaming: trigger modes, watermarks, stateful operations
- Storage formats: Parquet, Delta Lake, Apache Iceberg integration
- Resource management: driver/executor memory, dynamic allocation
- PySpark testing with `SparkSession` fixtures

## Relationships

- **Used by agents**: [[de-spark-expert]]
- **Related skills**: [[spark-best-practices]]
- **See also**: [[kafka]], [[iceberg]], [[airflow]], [[snowflake]]

## Sources

- `guides/spark/README.md` — overview, performance categories, external resource links
