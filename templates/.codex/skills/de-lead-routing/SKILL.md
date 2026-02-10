---
name: de-lead-routing
description: Routes data engineering tasks to the correct DE expert agent. Use when user requests data pipeline design, DAG authoring, SQL modeling, stream processing, or warehouse optimization.
user-invocable: false
---

# DE Lead Routing Skill

## Purpose

Routes data engineering tasks to appropriate DE expert agents. This skill contains the coordination logic for orchestrating data engineering agents across orchestration, modeling, processing, streaming, and warehouse specializations.

## Engineers Under Management

| Type | Agents | Purpose |
|------|--------|---------|
| de/orchestration | de-airflow-expert | DAG authoring, scheduling, testing |
| de/modeling | de-dbt-expert | SQL modeling, testing, documentation |
| de/processing | de-spark-expert | Distributed data processing |
| de/streaming | de-kafka-expert | Event streaming, topic design |
| de/warehouse | de-snowflake-expert | Cloud DWH, query optimization |
| de/architecture | de-pipeline-expert | Pipeline design, cross-tool patterns |

## Tool/Framework Detection

### Keyword Mapping

| Keyword | Agent |
|---------|-------|
| "airflow", "dag", "scheduling", "orchestration" | de-airflow-expert |
| "dbt", "modeling", "sql model", "analytics engineering" | de-dbt-expert |
| "spark", "pyspark", "distributed processing", "distributed" | de-spark-expert |
| "kafka", "streaming", "event", "consumer", "producer" | de-kafka-expert |
| "snowflake", "warehouse", "clustering key" | de-snowflake-expert |
| "pipeline", "ETL", "ELT", "data quality", "lineage" | de-pipeline-expert |
| "iceberg", "table format" | de-snowflake-expert or de-pipeline-expert |

### File Pattern Mapping

| Pattern | Agent |
|---------|-------|
| `dags/*.py`, `airflow.cfg`, `airflow_settings.yaml` | de-airflow-expert |
| `models/**/*.sql`, `dbt_project.yml`, `schema.yml` | de-dbt-expert |
| Spark job files, `spark-submit` configs | de-spark-expert |
| Kafka configs, `*.properties` (Kafka), `streams/*.java` | de-kafka-expert |
| Snowflake SQL, warehouse DDL | de-snowflake-expert |

## Command Routing

```
DE Request → Detection → Expert Agent

Airflow DAG → de-airflow-expert
dbt model   → de-dbt-expert
Spark job   → de-spark-expert
Kafka topic → de-kafka-expert
Snowflake   → de-snowflake-expert
Pipeline    → de-pipeline-expert
Multi-tool  → Multiple experts (parallel)
```

## Routing Rules

### 1. Pipeline Development Workflow

```
1. Receive pipeline task request
2. Identify tools and components:
   - DAG orchestration → de-airflow-expert
   - SQL transformations → de-dbt-expert
   - Distributed processing → de-spark-expert
   - Event streaming → de-kafka-expert
   - Warehouse operations → de-snowflake-expert
   - Architecture decisions → de-pipeline-expert
3. Select appropriate experts
4. Distribute tasks (parallel if 2+ tools)
5. Aggregate results
6. Present unified report
```

Example:
```
User: "Design a pipeline that runs dbt models from Airflow and loads into Snowflake"

Detection:
  - Airflow DAG → de-airflow-expert
  - dbt model → de-dbt-expert
  - Snowflake loading → de-snowflake-expert
  - Pipeline architecture → de-pipeline-expert

Route (parallel where independent):
  Task(de-pipeline-expert → overall architecture design)
  Task(de-airflow-expert → DAG structure)
  Task(de-dbt-expert → model design)
  Task(de-snowflake-expert → warehouse setup)

Aggregate:
  Pipeline architecture defined
  Airflow DAG: 5 tasks designed
  dbt: 12 models structured
  Snowflake: warehouse + schema configured
```

### 2. Data Quality Workflow

```
1. Analyze data quality requirements
2. Route to appropriate experts:
   - dbt tests → de-dbt-expert
   - Pipeline validation → de-pipeline-expert
   - Source freshness → de-airflow-expert
3. Coordinate cross-tool quality strategy
```

### 3. Multi-Tool Projects

For projects spanning multiple DE tools:

```
1. Detect all DE tools in project
2. Identify primary tool (most files/configs)
3. Route to appropriate experts:
   - If task spans multiple tools → parallel experts
   - If task is tool-specific → single expert
4. Coordinate cross-tool consistency
```

## Sub-agent Model Selection

### Model Mapping by Task Type

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Pipeline architecture | `opus` | Deep reasoning required |
| DAG/model review | `sonnet` | Balanced quality judgment |
| Implementation | `sonnet` | Standard code generation |
| Quick validation | `haiku` | Fast response |

### Model Mapping by Agent

| Agent | Default Model | Alternative |
|-------|---------------|-------------|
| de-pipeline-expert | `sonnet` | `opus` for architecture |
| de-airflow-expert | `sonnet` | `haiku` for DAG validation |
| de-dbt-expert | `sonnet` | `haiku` for test checks |
| de-spark-expert | `sonnet` | `opus` for optimization |
| de-kafka-expert | `sonnet` | `opus` for topology design |
| de-snowflake-expert | `sonnet` | `opus` for warehouse design |

### Task Call Examples

```
# Complex pipeline architecture
Task(
  subagent_type: "general-purpose",
  prompt: "Design end-to-end pipeline architecture following de-pipeline-expert guidelines",
  model: "opus"
)

# Standard DAG review
Task(
  subagent_type: "general-purpose",
  prompt: "Review Airflow DAGs in dags/ following de-airflow-expert guidelines",
  model: "sonnet"
)

# Quick dbt test validation
Task(
  subagent_type: "Explore",
  prompt: "Find all dbt models missing schema tests",
  model: "haiku"
)
```

## Parallel Execution

Following R009:
- Maximum 4 parallel instances
- Independent tool/module operations
- Coordinate cross-tool consistency

Example:
```
User: "Review all DE configs"

Detection:
  - dags/ → de-airflow-expert
  - models/ → de-dbt-expert
  - kafka/ → de-kafka-expert

Route (parallel):
  Task(de-airflow-expert role → review dags/, model: "sonnet")
  Task(de-dbt-expert role → review models/, model: "sonnet")
  Task(de-kafka-expert role → review kafka/, model: "sonnet")
```

## Display Format

```
[Analyzing] Detected: Airflow, dbt, Snowflake

[Delegating] de-airflow-expert:sonnet → DAG design
[Delegating] de-dbt-expert:sonnet → Model structure
[Delegating] de-snowflake-expert:sonnet → Warehouse config

[Progress] ███████████░ 2/3 experts completed

[Summary]
  Airflow: DAG with 5 tasks designed
  dbt: 12 models across 3 layers
  Snowflake: Warehouse + schema configured

Pipeline design completed.
```

## Integration with Other Routing Skills

- **dev-lead-routing**: Hands off to DE lead when data engineering keywords detected
- **secretary-routing**: DE agents accessible through secretary for management tasks
- **qa-lead-routing**: Coordinates with QA for data quality testing

## Usage

This skill is NOT user-invocable. It should be automatically triggered when the main conversation detects data engineering intent.

Detection criteria:
- User requests pipeline design or data engineering
- User mentions DE tool names (Airflow, dbt, Spark, Kafka, Snowflake)
- User provides DE-related file paths (dags/, models/, etc.)
- User requests data quality or lineage work
