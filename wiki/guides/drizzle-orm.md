---
title: "Drizzle ORM Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/drizzle-orm/README.md
related:
  - [[lang-typescript-expert]]
  - [[typescript-best-practices]]
---

# Drizzle ORM Guide

Reference documentation for Drizzle ORM usage patterns and common pitfalls, especially with `sql` template literals.

## Overview

Documents critical pitfalls when using Drizzle ORM's `sql` template literal syntax in TypeScript. The primary documented issue is that `${table.column}` generates a bare column name without table qualifier, causing silent semantic errors inside aliased subqueries. Includes decision tables and verification patterns. Used by `lang-typescript-expert` for TypeScript database layer work.

## Key Topics

- `sql` template literal behavior: `${table}` vs `${table.column}` vs raw SQL
- Aliased subquery column reference bug and fix pattern
- Safe vs unsafe `${...}` usage decision table
- Verification with `.toSQL()` before execution
- Top-level query builder vs raw SQL contexts

## Relationships

- **Used by agents**: [[lang-typescript-expert]], [[fe-vercel-agent]]
- **Related skills**: [[typescript-best-practices]]
- **See also**: [[typescript]], [[postgres]], [[supabase-postgres]]

## Sources

- `guides/drizzle-orm/README.md` — sql template literal pitfalls, fix patterns, decision table
