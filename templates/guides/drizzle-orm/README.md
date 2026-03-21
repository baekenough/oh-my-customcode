# Drizzle ORM: sql Template Literal Pitfalls

## The Bug: Column References in Subqueries

When using Drizzle ORM's `sql` template literals, `${table.column}` generates a **bare column name without the table qualifier**. This causes silent semantic errors inside aliased subqueries.

### Symptom

```typescript
// Code
sql`SELECT ${agentInvocations.errorSummary} as sub_es
    FROM ${agentInvocations} AS ai2
    WHERE ai2.agent_type = ${agentInvocations.agentType}`

// Generated SQL (WRONG)
SELECT "error_summary" as sub_es
FROM "agent_invocations" AS ai2
WHERE ai2.agent_type = "agent_type"  -- "agent_type" becomes a literal string, always true!
```

`${agentInvocations.agentType}` expands to the **quoted column name** `"agent_type"` — not the value of the column. The `WHERE` clause compares `ai2.agent_type = "agent_type"`, which SQLite treats as a string literal match — always true for rows where `agent_type` equals the string `"agent_type"`.

### Why Reviewers Miss It

- The code *looks* correct — you see `agentInvocations.agentType` and assume it's a column reference.
- Drizzle's `${table.column}` syntax works fine in top-level queries where table context is unambiguous.
- The bug only manifests inside subqueries with table aliases (`AS ai2`) — normal queries pass.
- No compile-time error; the SQL executes but returns wrong results.

## The Fix: Raw SQL for Subquery Internal References

Use raw SQL strings for column references *inside* aliased subqueries. Reserve `${table.column}` only for Drizzle's top-level query builder where it resolves correctly.

```typescript
// CORRECT: raw SQL column references inside aliased subquery
sql`SELECT ai2.error_summary as sub_es
    FROM ${agentInvocations} AS ai2
    WHERE ai2.agent_type = ${agentInvocations}.agent_type`
```

Note: `${agentInvocations}` (the table object itself) still correctly expands to the table name and is safe to use for the `FROM` clause. Only *column* references inside subqueries must be written as raw SQL.

## Decision Table

| Context | Pattern | Safe? |
|---------|---------|-------|
| Top-level `FROM` clause | `${table}` | ✅ Yes |
| Top-level `WHERE` with parameterized value | `${value}` | ✅ Yes (auto-parameterized) |
| Top-level `SELECT` column | `${table.column}` | ✅ Yes |
| Inside aliased subquery `SELECT` | `${table.column}` | ❌ No — bare column name |
| Inside aliased subquery `WHERE` comparison | `${table.column}` | ❌ No — string literal, not column ref |
| Inside aliased subquery (fixed) | `alias.column_name` | ✅ Yes |

## Verification

Use `.toSQL()` to inspect generated SQL before running:

```typescript
const query = sql`SELECT ${agentInvocations.errorSummary} as sub_es
    FROM ${agentInvocations} AS ai2
    WHERE ai2.agent_type = ${agentInvocations.agentType}`

console.log(query.toSQL())
// Reveals the bare column names — catches the bug before runtime
```

## Key Takeaway

> **`${table.column}` in Drizzle's `sql` template generates a bare column identifier, not a qualified reference.** Inside aliased subqueries, this breaks table-qualified comparisons. Always use raw `alias.column_name` strings inside subquery bodies.
