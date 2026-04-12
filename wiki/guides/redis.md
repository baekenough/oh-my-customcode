---
title: "Redis Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/redis/README.md
related:
  - [[db-redis-expert]]
  - [[redis-best-practices]]
---

# Redis Guide

Reference documentation for Redis in-memory data store patterns, data structure selection, and operational best practices.

## Overview

Covers Redis data structure selection (String, Hash, List, Set, Sorted Set, Stream, HyperLogLog, Bitmap), caching patterns, pub/sub and Streams for event-driven systems, Lua scripting for atomicity, clustering and high availability, persistence (RDB/AOF), and security configuration. Used by `db-redis-expert` for caching and messaging tasks.

## Key Topics

- Data structure selection guide (caching, queuing, leaderboards, rate limiting, sessions)
- Caching patterns: cache-aside, write-through, write-behind, TTL strategies
- Pub/Sub vs Streams for reliable message delivery
- Lua scripting for atomic multi-key operations
- Redis Cluster and Sentinel for high availability
- Distributed lock patterns (SET NX EX, Redlock)
- Persistence: RDB snapshots vs AOF journaling

## Relationships

- **Used by agents**: [[db-redis-expert]]
- **Related skills**: [[redis-best-practices]]
- **See also**: [[postgres]], [[kafka]], [[supabase-postgres]]

## Sources

- `guides/redis/README.md` — data structure guide, categories, command reference
