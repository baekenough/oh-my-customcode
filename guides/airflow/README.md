# Apache Airflow Guide (3.2.0)

Reference documentation for Apache Airflow 3.2.0 DAG development best practices.

## Source

Based on [Apache Airflow 3.2.0 official documentation](https://airflow.apache.org/docs/apache-airflow/3.2.0/) and [Astronomer best practices](https://docs.astronomer.io/).

## Airflow 3.x Key Changes

| Change | Details |
|--------|---------|
| SDK namespace | `from airflow.sdk import DAG, task, Asset` |
| Task Execution (AIP-72) | Isolated subprocess execution via Execution API Server |
| Internal API (AIP-44) | Components use API instead of direct DB access |
| Asset (was Dataset) | Data-aware scheduling primitive renamed |
| Context cleanup | `execution_date` → `dag_run.logical_date` |
| New UI | React-based web interface |
| TaskFlow API | `@task` is the default pattern for Python tasks |

## Categories

| Priority | Category | Impact |
|----------|----------|--------|
| 1 | DAG Authoring (airflow.sdk) | CRITICAL |
| 2 | TaskFlow API & Dynamic Mapping | CRITICAL |
| 3 | Testing (dag.test()) | HIGH |
| 4 | Scheduling & Assets | HIGH |
| 5 | Connections & Variables | MEDIUM |
| 6 | Monitoring & SLA | MEDIUM |
| 7 | Performance Optimization | LOW-MEDIUM |
| 8 | 2.x → 3.x Migration | HIGH |

## Usage

This guide is referenced by:
- **Agent**: de-airflow-expert
- **Skill**: airflow-best-practices

## External Resources

- [Airflow 3.2.0 Official Docs](https://airflow.apache.org/docs/apache-airflow/3.2.0/)
- [Airflow 3.2.0 Best Practices](https://airflow.apache.org/docs/apache-airflow/3.2.0/best-practices.html)
- [Airflow Task SDK](https://airflow.apache.org/docs/apache-airflow/3.2.0/authoring-and-scheduling/index.html)
- [Airflow TaskFlow API](https://airflow.apache.org/docs/apache-airflow/3.2.0/core-concepts/taskflow.html)
- [Migration Guide 2.x → 3.x](https://airflow.apache.org/docs/apache-airflow/3.2.0/migration-guide.html)
- [Astronomer Docs](https://docs.astronomer.io/)
