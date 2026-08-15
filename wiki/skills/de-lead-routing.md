---
title: DE Lead Routing
type: skill
updated: 2026-08-15
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

## Routing Order

Step 1 evaluates Agent Teams eligibility ([[R018]]), Step 2 selects the DE expert. Teams is available only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **AND** `TeamCreate` is present in the tool list — the env var alone is not sufficient, and `SendMessage` presence is not evidence of Teams. When that Detection resolves to **No**, Step 1 is skipped entirely and routing proceeds via the Agent tool under [[R009]]/[[R010]]; expert selection never depended on Teams, so nothing is lost. Teams is preferred for multi-tool pipeline builds, end-to-end data flow design, and cross-tool data quality analysis; the Agent tool for single-tool tasks and quick DAG/model validation.

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
- Content-drift resync 2026-08-15 (v1.1.47, #1582): documented the Step 1/Step 2 routing order and the tightened Agent Teams availability check — env var **AND** `TeamCreate` present (previously "env var or TeamCreate/SendMessage present"), plus the newly added explicit fallback that a **No** Detection skips Step 1 and routes via the Agent tool under [[R009]]/[[R010]].
