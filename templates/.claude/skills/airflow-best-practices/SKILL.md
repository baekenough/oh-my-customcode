---
name: airflow-best-practices
description: Apache Airflow best practices for DAG authoring, testing, and production deployment
scope: core
user-invocable: false
---

# Apache Airflow Best Practices (3.2.0)

## DAG Authoring

### Imports (Airflow 3.x)
- Use `from airflow.sdk import DAG, task, Asset` — the stable public API
- Legacy `from airflow.models import DAG` and `from airflow.decorators import task` are deprecated

### Top-Level Code (CRITICAL)
- Avoid heavy computation at module level (executed on every DAG parse)
- Minimize imports at module level — lazy-load inside `@task` functions
- Never call APIs, query databases, or access Variables at top level
- If Variables needed at top level, enable experimental cache with TTL

### TaskFlow API (Default Pattern)
- Use `@task` decorator for all Python tasks (preferred over classic operators)
- XCom serialization is automatic — return values become XCom
- Use `@task.branch` for branching logic
- Use `@task.sensor` for sensor tasks

### Dynamic Task Mapping
- Use `task.expand()` for runtime-determined task instances
- Combine with `.partial()` for fixed kwargs
- Map over lists, dicts, or XCom outputs from upstream tasks

### Scheduling
- Use cron expressions or timetables for `schedule` parameter
- Set `catchup=False` for most DAGs
- Use data-aware scheduling with `Asset` (replaces `Dataset`) for dependencies
- Configure SLA monitoring

### Task Dependencies
- Use `>>` / `<<` operators for clarity
- Group related tasks with `TaskGroup`
- Avoid deep nesting (max 3 levels)

## Testing

### Local Testing
- Use `dag.test()` in `if __name__ == "__main__":` block for IDE debugging
- Runs all tasks in single serialized process without executor

### Unit Tests
- Test DAG import without errors
- Detect cycles in dependencies
- Mock external connections
- Test task logic independently

### Integration Tests
- Use Airflow test mode
- Validate end-to-end workflows
- Test with sample data

## Production Deployment

### Performance
- Lazy-load heavy libraries inside `@task` functions
- Use connection pooling
- Minimize DAG parse time (target < 30s for all DAGs)
- Enable parallelism appropriately

### Reliability
- Set appropriate `retries` and `retry_delay`
- Use SLA callbacks for monitoring
- Implement proper error handling with `on_failure_callback`
- Log important events

## Migration: 2.x → 3.x

### Deprecated (Remove or Replace)
| Deprecated | Replacement |
|-----------|-------------|
| `from airflow.models import DAG` | `from airflow.sdk import DAG` |
| `from airflow.decorators import task` | `from airflow.sdk import task` |
| `Dataset` | `Asset` |
| `execution_date` in context | `dag_run.logical_date` |
| `conf` in task context | Removed — use Variables or params |

### Architecture Changes
- **AIP-72**: Task Execution Interface — tasks run in isolated subprocesses via Execution API Server
- **AIP-44**: Internal API — components communicate via API, not direct DB access
- **New UI**: React-based web interface (replaces Flask-based UI)

## References
- [Airflow 3.2.0 Best Practices](https://airflow.apache.org/docs/apache-airflow/3.2.0/best-practices.html)
- [Airflow SDK (Task SDK)](https://airflow.apache.org/docs/apache-airflow/3.2.0/authoring-and-scheduling/index.html)
- [Migration Guide 2.x → 3.x](https://airflow.apache.org/docs/apache-airflow/3.2.0/migration-guide.html)
