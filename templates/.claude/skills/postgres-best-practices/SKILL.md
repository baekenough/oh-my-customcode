---
name: postgres-best-practices
description: PostgreSQL best practices for database design, query optimization, and performance tuning
user-invocable: false
---

# PostgreSQL Best Practices

## Query Optimization

### EXPLAIN ANALYZE (CRITICAL)
- Use `EXPLAIN ANALYZE` to understand query plans
- Identify slow operations: Seq Scan, Nested Loop
- Check row estimates vs actual rows
- Monitor buffers: shared hit vs read

### Indexing (CRITICAL)
- B-tree: default, most use cases
- GIN: JSONB, arrays, full-text search
- GiST: geometry, range types
- BRIN: large sequential tables (time-series)
- Partial indexes: filtered queries
- Covering indexes (INCLUDE): avoid heap fetches

### Index Maintenance
- Create indexes concurrently: `CREATE INDEX CONCURRENTLY`
- Monitor usage: `pg_stat_user_indexes`
- Remove unused indexes
- Reindex bloated indexes

## Table Design

### Partitioning (HIGH)
- Range partitioning: time-series data
- List partitioning: categorical data
- Hash partitioning: even distribution
- Declarative partitioning (PG 10+)

### Data Types
- Use appropriate types (int vs bigint, varchar vs text)
- JSONB for semi-structured data
- Arrays for multi-value columns
- UUIDs for distributed IDs

## Performance Tuning

### Vacuum and Autovacuum
- Autovacuum: default enabled
- Monitor bloat: `pg_stat_user_tables`
- Tune autovacuum thresholds
- Manual VACUUM for large updates

### Connection Pooling
- Use pgBouncer or PgPool
- Transaction pooling for short transactions
- Session pooling for long transactions
- Max connections: tune based on workload

### Configuration
- `shared_buffers`: 25% of RAM
- `work_mem`: per operation, tune carefully
- `effective_cache_size`: 50-75% of RAM
- `random_page_cost`: 1.1 for SSD

## References
- [PostgreSQL Performance Optimization](https://wiki.postgresql.org/wiki/Performance_Optimization)
