# PostgreSQL Guide

Reference documentation for pure PostgreSQL database administration and PG-specific SQL patterns.

## Source

Based on [PostgreSQL official documentation](https://www.postgresql.org/docs/current/) and community best practices.

## Categories

| Priority | Category | Impact |
|----------|----------|--------|
| 1 | Query Optimization | CRITICAL |
| 2 | Indexing Strategies | CRITICAL |
| 3 | Partitioning | HIGH |
| 4 | PG-Specific SQL Dialect | HIGH |
| 5 | Replication & HA | HIGH |
| 6 | Maintenance & Vacuum | MEDIUM |
| 7 | Extensions | MEDIUM |
| 8 | Security & Roles | LOW-MEDIUM |

## PG-Specific SQL Quick Reference

### Beyond ANSI SQL

| Feature | Syntax | Use Case |
|---------|--------|----------|
| UPSERT | `INSERT ... ON CONFLICT DO UPDATE` | Idempotent writes |
| RETURNING | `INSERT/UPDATE/DELETE ... RETURNING *` | Get affected rows |
| DISTINCT ON | `SELECT DISTINCT ON (col) ...` | Top-1-per-group |
| LATERAL | `FROM t1, LATERAL (SELECT ... WHERE t1.id = ...)` | Correlated subquery as join |
| FILTER | `count(*) FILTER (WHERE condition)` | Conditional aggregation |
| JSONB ops | `->>`, `@>`, `?`, `jsonb_path_query` | JSON document queries |
| Array ops | `ANY(array)`, `array_agg`, `unnest` | Array manipulation |
| generate_series | `generate_series(1, 100)` | Sequence generation |
| GROUPING SETS | `GROUP BY GROUPING SETS ((a), (b), ())` | Multi-level aggregation |
| Recursive CTE | `WITH RECURSIVE ... UNION ALL` | Tree/graph traversal |

## Relationship to Other DB Agents

| Agent | Scope | When to Use |
|-------|-------|------------|
| db-postgres-expert | Pure PostgreSQL | Any PostgreSQL without Supabase |
| db-supabase-expert | Supabase + PostgreSQL | Supabase projects with RLS, Edge Functions |

## Usage

This guide is referenced by:
- **Agent**: db-postgres-expert
- **Skill**: postgres-best-practices

## External Resources

- [PostgreSQL Docs](https://www.postgresql.org/docs/current/)
- [PostgreSQL Wiki](https://wiki.postgresql.org/)
- [pganalyze Blog](https://pganalyze.com/blog)
- [Use The Index, Luke](https://use-the-index-luke.com/)
- [PostgreSQL Exercises](https://pgexercises.com/)
