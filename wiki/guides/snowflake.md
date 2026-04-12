---
title: "Snowflake Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/snowflake/README.md
related:
  - [[de-snowflake-expert]]
  - [[snowflake-best-practices]]
---

# Snowflake Guide

Reference documentation for Snowflake cloud data warehouse best practices and performance optimization.

## Overview

Covers Snowflake virtual warehouse sizing and auto-suspend strategies, query optimization (clustering keys, search optimization, result caching), data loading patterns (COPY INTO, Snowpipe), data sharing, security and governance (RBAC, dynamic data masking), and cost management. Used by `de-snowflake-expert` for analytics engineering and data warehousing tasks.

## Key Topics

- Virtual warehouse design: sizing, auto-suspend/resume, multi-cluster
- Query optimization: clustering keys, micro-partition pruning, result cache
- Data loading: COPY INTO, Snowpipe (continuous), external tables
- Storage optimization: compression, clustering, zero-copy cloning
- Data sharing and Snowflake Marketplace
- Role-based access control (RBAC) and row-level security
- Cost management: credit monitoring, resource monitors

## Relationships

- **Used by agents**: [[de-snowflake-expert]]
- **Related skills**: [[snowflake-best-practices]]
- **See also**: [[dbt]], [[iceberg]], [[spark]]

## Sources

- `guides/snowflake/README.md` — overview, categories, external resource links
