---
title: db-redis-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/db-redis-expert.md
related:
  - [[db-postgres-expert]]
  - [[db-supabase-expert]]
  - [[be-fastapi-expert]]
---

# db-redis-expert

Expert Redis developer for caching strategies, data structure design, Pub/Sub messaging, Streams, Lua scripting, cluster management, and in-memory data architecture.

## Overview

`db-redis-expert` covers all aspects of Redis from data structure selection and caching pattern design to cluster configuration and operational tuning. It specializes in cache-aside/write-through/write-behind patterns, choosing the right data structure (String, Hash, List, Set, Sorted Set, Stream, HyperLogLog, Bitmap), Pub/Sub and Redis Streams for real-time messaging, atomic operations via Lua scripting, and high-availability setups with Cluster and Sentinel.

Memory is `user`-scoped for cross-project Redis expertise retention.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `redis-best-practices`
- **Memory**: user (cross-project Redis knowledge)
- **Effort**: high

## Relationships

- **Depends on**: `redis-best-practices` skill, `guides/redis/`
- **Used by**: `dev-lead-routing` skill (caching/messaging task routing)
- **See also**: [[db-postgres-expert]] (primary data store), [[be-fastapi-expert]] (async Redis integration)

## Sources

- `.claude/agents/db-redis-expert.md` — agent definition
