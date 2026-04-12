---
title: "Apache Iceberg Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/iceberg/README.md
related:
  - [[de-snowflake-expert]]
  - [[de-pipeline-expert]]
---

# Apache Iceberg Guide

Reference documentation for Apache Iceberg open table format for large-scale analytical workloads.

## Overview

Apache Iceberg is an open table format for huge analytic tables in data lakes. This guide covers table maintenance (compaction, snapshot expiry, orphan file removal), partition evolution, schema evolution without rewrites, catalog management, and integration with Spark, Trino, and Flink. Referenced by `de-snowflake-expert` and `de-pipeline-expert`.

## Key Topics

- Table maintenance: `rewrite_data_files`, `expire_snapshots`, `remove_orphan_files`
- Partition evolution: add/drop/replace partition fields without data rewrite
- Hidden partitioning and partition transforms (identity, bucket, truncate, time)
- Schema evolution: add, rename, reorder, drop columns safely
- Type promotion rules (int → long, float → double)
- Catalog management (Hive Metastore, REST, AWS Glue)
- Integration patterns with Spark, Trino, Flink

## Relationships

- **Used by agents**: [[de-snowflake-expert]], [[de-pipeline-expert]]
- **Related skills**: [[spark-best-practices]]
- **See also**: [[spark]], [[snowflake]], [[dbt]]

## Sources

- `guides/iceberg/README.md` — categories, key concepts, maintenance patterns
