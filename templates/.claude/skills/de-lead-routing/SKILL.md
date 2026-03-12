---
name: de-lead-routing
description: Routes data engineering tasks to the correct DE expert agent. Use when user requests data pipeline design, DAG authoring, SQL modeling, stream processing, or warehouse optimization.
user-invocable: false
context: fork
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

## Routing Decision (Priority Order)

Before routing via Agent tool, evaluate in this order:

### Step 1: Agent Teams Eligibility (R018)
Check if Agent Teams is available (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present).

| Scenario | Preferred |
|----------|-----------|
| Single-tool DE task | Agent Tool |
| Multi-tool pipeline design (3+ tools) | Agent Teams |
| Cross-tool data quality analysis | Agent Teams |
| Quick DAG/model validation | Agent Tool |

### Step 2: Codex-Exec Hybrid (Code Generation)
For **new pipeline code**, **DAG scaffolding**, or **SQL model generation**:

1. Check `/tmp/.claude-env-status-*` for codex availability
2. If codex available → suggest hybrid workflow for code generation
3. If codex unavailable → use DE expert directly

**Suitable**: New DAG files, dbt model scaffolding, SQL template generation
**Unsuitable**: Existing pipeline modification, architecture decisions, data quality analysis

### Step 3: Expert Selection
Route to appropriate DE expert based on tool/framework detection.

### Step 4: Ontology-RAG Enrichment (R019)

After agent selection, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**

### Step 5: Soul Injection

If the selected agent has `soul: true` in its frontmatter:

1. Read `.claude/agents/souls/{agent-name}.soul.md`
2. If file exists, prepend soul content to the agent's prompt:
   `"Identity context:\n{soul content}\n\n---\n\n"`
3. If file doesn't exist → skip silently (no error, no injection)

**This step runs after ontology-RAG enrichment. Soul content is identity context, not capability instructions.**

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
  Agent(de-pipeline-expert → overall architecture design)
  Agent(de-airflow-expert → DAG structure)
  Agent(de-dbt-expert → model design)
  Agent(de-snowflake-expert → warehouse setup)

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

### Agent Call Examples

```
# Complex pipeline architecture
Agent(
  subagent_type: "general-purpose",
  prompt: "Design end-to-end pipeline architecture following de-pipeline-expert guidelines",
  model: "opus"
)

# Standard DAG review
Agent(
  subagent_type: "general-purpose",
  prompt: "Review Airflow DAGs in dags/ following de-airflow-expert guidelines",
  model: "sonnet"
)

# Quick dbt test validation
Agent(
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
  Agent(de-airflow-expert role → review dags/, model: "sonnet")
  Agent(de-dbt-expert role → review models/, model: "sonnet")
  Agent(de-kafka-expert role → review kafka/, model: "sonnet")
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

## No Match Fallback

When a data engineering tool is detected but no matching agent exists:

```
User Input → No matching DE agent
  ↓
Detect: DE tool keyword or config file pattern
  ↓
Delegate to mgr-creator with context:
  domain: detected DE tool
  type: de-engineer
  keywords: extracted tool names
  file_patterns: detected config patterns
  skills: auto-discover from .claude/skills/
  guides: auto-discover from templates/guides/
```

**Examples of dynamic creation triggers:**
- New data tools (e.g., "Dagster DAG 만들어줘", "Flink 스트리밍 설정해줘")
- Unfamiliar data formats or connectors
- Data tool detected in project but no specialist agent

## Usage

This skill is NOT user-invocable. It should be automatically triggered when the main conversation detects data engineering intent.

Detection criteria:
- User requests pipeline design or data engineering
- User mentions DE tool names (Airflow, dbt, Spark, Kafka, Snowflake)
- User provides DE-related file paths (dags/, models/, etc.)
- User requests data quality or lineage work
