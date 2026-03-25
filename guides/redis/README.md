# Redis Guide

Reference documentation for Redis in-memory data store best practices and command patterns.

## Source

Based on [Redis official documentation](https://redis.io/docs/) and community best practices.

## Categories

| Priority | Category | Impact |
|----------|----------|--------|
| 1 | Caching Patterns | CRITICAL |
| 2 | Data Structure Selection | CRITICAL |
| 3 | Pub/Sub & Streams | HIGH |
| 4 | Lua Scripting | HIGH |
| 5 | Clustering & HA | HIGH |
| 6 | Performance Optimization | MEDIUM |
| 7 | Persistence | MEDIUM |
| 8 | Security | LOW-MEDIUM |

## Data Structure Selection Guide

| Use Case | Data Structure | Key Commands |
|----------|---------------|-------------|
| Simple cache | String | GET, SET, SETEX, MGET |
| Object cache | Hash | HSET, HGET, HGETALL, HINCRBY |
| Message queue | List | LPUSH, BRPOP, LRANGE |
| Unique items | Set | SADD, SMEMBERS, SINTER |
| Leaderboard | Sorted Set | ZADD, ZRANGE, ZRANGEBYSCORE |
| Event log | Stream | XADD, XREAD, XRANGE |
| Count uniques | HyperLogLog | PFADD, PFCOUNT, PFMERGE |
| Feature flags | Bitmap | SETBIT, GETBIT, BITCOUNT |
| Rate limiting | Sorted Set or String | ZADD+ZCARD or INCR+EXPIRE |
| Distributed lock | String | SET NX EX, Redlock algorithm |
| Session store | Hash | HSET, HGETALL, EXPIRE |

## Usage

This guide is referenced by:
- **Agent**: db-redis-expert
- **Skill**: redis-best-practices

## External Resources

- [Redis Docs](https://redis.io/docs/)
- [Redis Commands](https://redis.io/commands/)
- [Redis University](https://university.redis.com/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
- [Redis Patterns](https://redis.io/docs/manual/patterns/)
