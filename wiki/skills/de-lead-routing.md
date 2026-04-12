---
title: DE Lead Routing
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/de-lead-routing/SKILL.md
related:
  - [[de-airflow-expert]]
  - [[de-dbt-expert]]
  - [[de-spark-expert]]
  - [[de-kafka-expert]]
  - [[de-snowflake-expert]]
  - [[de-pipeline-expert]]
---

# DE Lead Routing

Routes data engineering tasks to the correct DE/pipeline specialist agent.

## Overview

Routing skill for data engineering tasks. Detects the appropriate DE expert based on keywords, file patterns, and technology indicators, then delegates via the Agent tool. Targets: `de-airflow-expert` (DAG/Airflow), `de-dbt-expert` (SQL models), `de-spark-expert` (PySpark/Scala), `de-kafka-expert` (streaming), `de-snowflake-expert` (warehouse), `de-pipeline-expert` (general pipelines). Supports R019 ontology-RAG enrichment.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[secretary-routing]], [[dev-lead-routing]], [[qa-lead-routing]]
- **See also**: [[R010]], [[R015]], [[R019]]

## Sources

- `.claude/skills/de-lead-routing/SKILL.md` — skill definition
