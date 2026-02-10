---
name: pipeline-architecture-patterns
description: Data pipeline architecture patterns for ETL/ELT design, orchestration, and data quality frameworks
user-invocable: false
---

# Data Pipeline Architecture Patterns

## Pipeline Architectures

### ETL vs ELT (CRITICAL)
- **ETL**: Extract → Transform (staging) → Load
  - Traditional, on-premise data warehouses
  - Pre-aggregation, complex transformations
- **ELT**: Extract → Load (raw) → Transform (in warehouse)
  - Cloud warehouses (Snowflake, BigQuery)
  - Leverage warehouse compute power

### Lambda Architecture
- Batch layer: historical data processing
- Speed layer: real-time stream processing
- Serving layer: merge batch + real-time views
- Complexity: maintain two codebases

### Kappa Architecture
- Stream-only processing
- Single codebase for batch + real-time
- Reprocessing via replay
- Simpler than Lambda

### Medallion Architecture
- **Bronze**: Raw data (append-only)
- **Silver**: Cleaned, conformed data
- **Gold**: Business-level aggregations
- Databricks pattern

## Orchestration Patterns

### DAG-Based Orchestration
- Airflow, Prefect, Dagster
- Task dependencies as DAG
- Retries, backfills, scheduling

### Event-Driven Orchestration
- Kafka, Pub/Sub triggers
- Real-time, low-latency
- Decoupled producers/consumers

### Hybrid Orchestration
- Scheduled batch + event-driven streams
- Example: Airflow DAG triggered by Kafka event

## Data Quality Frameworks

### Data Contracts (CRITICAL)
- Define schema, freshness, volume expectations
- Producer-consumer agreement
- Break build on violation

### Validation Frameworks
- **Great Expectations**: Python-based expectations
- **dbt tests**: SQL-based tests
- **Soda**: YAML-based checks

### Data Lineage
- Track data origin and transformations
- Debug data quality issues
- Compliance and auditing

## Idempotency Patterns

### Idempotent Design (CRITICAL)
- Same input → same output (no side effects)
- Upserts instead of inserts
- Partition replacement instead of append

### Deduplication
- Use unique keys
- Window-based deduplication
- Consumer group offset management

## References
- [Data Engineering Design Patterns](https://www.oreilly.com/library/view/data-engineering-design/9781098130725/)
