---
title: "dbt Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/dbt/README.md
related:
  - [[de-dbt-expert]]
  - [[dbt-best-practices]]
---

# dbt Guide

Reference documentation for dbt (data build tool) SQL modeling and analytics engineering best practices.

## Overview

dbt is the analytics engineering standard for transforming data in the warehouse using SQL and Jinja templating. This guide covers project structure, modeling patterns (staging/intermediate/marts), testing strategies, materializations, documentation, macros, and CI/CD deployment. Used by `de-dbt-expert` for analytics engineering tasks.

## Key Topics

- Project structure: staging, intermediate, marts layers
- Modeling patterns and naming conventions
- Testing: schema tests, data tests, dbt-expectations
- Materializations: table, view, incremental, snapshot
- Documentation and dbt docs site generation
- Macros and Jinja templating patterns
- Deployment and CI/CD integration

## Relationships

- **Used by agents**: [[de-dbt-expert]]
- **Related skills**: [[dbt-best-practices]]
- **See also**: [[snowflake]], [[spark]], [[airflow]]

## Sources

- `guides/dbt/README.md` — overview, categories, external resource links
