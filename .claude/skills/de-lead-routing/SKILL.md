---
name: de-lead-routing
description: Routes data engineering tasks to the correct DE expert agent. Use when user requests data pipeline design, DAG authoring, SQL modeling, stream processing, or warehouse optimization.
scope: core
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

1. Check `/tmp/.claude-env-status-*` for codex, gemini, and rtk availability
2. If codex available AND task involves new file creation → automatically delegate to `/codex-exec` for scaffolding:
   - Display: `[Codex Hybrid] Delegating to codex-exec...`
   - codex-exec generates initial code (strength: fast generation)
   - Selected DE expert reviews and refines codex output (strength: reasoning, quality)
3. If codex unavailable but gemini available → delegate to `/gemini-exec` for scaffolding:
   - Display: `[Gemini Hybrid] Delegating to gemini-exec...`
   - gemini-exec generates initial code
   - Selected DE expert reviews and refines output
4. If RTK available (`RTK=available` in env status) → optionally wrap DE expert output through RTK to reduce token consumption by 60-90%:
   - Display: `[RTK Proxy] Token optimization active via rtk-exec`
   - RTK acts as a transparent proxy — no change to expert selection
5. If none available → display `[External CLI] Unavailable — proceeding with {expert} directly` and use DE expert directly

**Suitable**: New DAG files, dbt model scaffolding, SQL template generation
**Unsuitable**: Existing pipeline modification, architecture decisions, data quality analysis

### Step 3: Expert Selection
Route to appropriate DE expert based on tool/framework detection.

> **Permission Mode**: When spawning agents, pass `mode: "bypassPermissions"` in the Agent tool call if the session uses bypassPermissions. Without explicit mode, CC defaults to `acceptEdits`.

### Step 4: Ontology-RAG Enrichment (R019)

If `get_agent_for_task` MCP tool is available, call it with the original query and inject `suggested_skills` into the agent prompt. Skip silently on failure.

### Step 5: Soul Injection (R006)

If the selected agent has `soul: true` in frontmatter, read and prepend `.claude/agents/souls/{agent-name}.soul.md` content to the prompt. Skip silently if file doesn't exist.

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
