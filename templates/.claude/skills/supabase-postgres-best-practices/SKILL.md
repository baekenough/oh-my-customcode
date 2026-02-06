---
name: supabase-postgres-best-practices
description: PostgreSQL performance optimization guidelines from Supabase. Apply when writing SQL, designing schemas, configuring RLS, or optimizing database performance.
user-invocable: false
---

## Supabase PostgreSQL Best Practices

> Source: https://github.com/supabase/agent-skills

### Rule Categories (Prioritized by Impact)

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | query- |
| 2 | Connection Management | CRITICAL | conn- |
| 3 | Security & RLS | CRITICAL | security- |
| 4 | Schema Design | HIGH | schema- |
| 5 | Concurrency & Locking | MEDIUM-HIGH | lock- |
| 6 | Data Access Patterns | MEDIUM | data- |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | monitor- |
| 8 | Advanced Features | LOW | advanced- |

### 1. Query Performance (CRITICAL)

- Always add indexes for columns used in WHERE, JOIN, and ORDER BY clauses
- Use partial indexes for filtered queries: `CREATE INDEX idx_active ON users(email) WHERE active = true`
- Prefer `EXISTS` over `IN` for subqueries
- Avoid `SELECT *` - specify only needed columns
- Use `EXPLAIN ANALYZE` to verify query plans
- Add composite indexes for multi-column queries (column order matters)
- Use covering indexes to avoid heap lookups

### 2. Connection Management (CRITICAL)

- Use Supabase connection pooler (PgBouncer) for serverless/edge functions
- Use transaction mode for short-lived queries
- Use session mode only when needed (prepared statements, advisory locks)
- Set appropriate pool size limits
- Release connections promptly - avoid holding connections during external calls
- Use connection timeouts to prevent leaks

### 3. Security & RLS (CRITICAL)

- Enable RLS on ALL tables exposed via Supabase API
- Write policies using `auth.uid()` and `auth.jwt()`
- Avoid functions marked `SECURITY DEFINER` unless necessary
- Use `SECURITY INVOKER` as default for functions
- Never trust client-side data - validate in policies
- Test RLS policies with different roles
- Use `USING` for read policies, `WITH CHECK` for write policies

### 4. Schema Design (HIGH)

- Use appropriate data types (e.g., `uuid` for IDs, `timestamptz` for times)
- Add `NOT NULL` constraints where applicable
- Use `CHECK` constraints for data validation
- Prefer `text` over `varchar(n)` unless length limit is meaningful
- Use partial indexes instead of filtered queries
- Design schemas for the access patterns, not just the data model

### 5. Concurrency & Locking (MEDIUM-HIGH)

- Use `SELECT ... FOR UPDATE SKIP LOCKED` for queue patterns
- Keep transactions short to minimize lock contention
- Avoid long-running transactions during migrations
- Use advisory locks for application-level coordination
- Be aware of lock ordering to prevent deadlocks

### 6. Data Access Patterns (MEDIUM)

- Use Supabase client libraries for standard CRUD
- Use RPC functions for complex operations
- Implement pagination with cursor-based approach (not OFFSET)
- Use realtime subscriptions judiciously
- Batch operations where possible

### 7. Monitoring & Diagnostics (LOW-MEDIUM)

- Monitor `pg_stat_statements` for slow queries
- Check `pg_stat_user_indexes` for unused indexes
- Monitor connection count and pool utilization
- Set up alerts for long-running queries
- Review lock waits periodically

### 8. Advanced Features (LOW)

- Use CTEs for readable complex queries (but note CTE materialization)
- Leverage PostgreSQL extensions (pgvector, pg_trgm, etc.)
- Use generated columns for computed values
- Consider table partitioning for very large tables
- Use LISTEN/NOTIFY for event-driven patterns

### References
- Supabase Documentation: https://supabase.com/docs
- PostgreSQL Official Docs: https://www.postgresql.org/docs/
- Supabase Agent Skills: https://github.com/supabase/agent-skills

For detailed rule files with specific examples, see guides/supabase-postgres/.
