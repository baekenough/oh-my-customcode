---
name: airflow-best-practices
description: Apache Airflow best practices for DAG authoring, testing, and production deployment
user-invocable: false
---

# Apache Airflow Best Practices

## DAG Authoring

### Top-Level Code (CRITICAL)
- Avoid heavy computation at module level (executed on every DAG parse)
- Minimize imports at module level
- Use `@task` decorator (TaskFlow API) for Python tasks
- Keep DAG file under 1000 lines

### Scheduling
- Use cron expressions or timetables
- Set `catchup=False` for most cases
- Use data-aware scheduling (datasets) for dependencies
- Configure SLA monitoring

### Task Dependencies
- Use `>>` / `<<` for clarity
- Group related tasks with TaskGroup
- Avoid deep nesting (max 3 levels)

## Testing

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
- Lazy-load heavy libraries inside tasks
- Use connection pooling
- Minimize DAG parse time
- Enable parallelism

### Reliability
- Set appropriate retries and retry_delay
- Use SLA callbacks for monitoring
- Implement proper error handling
- Log important events

## References
- [Airflow Best Practices](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html)
