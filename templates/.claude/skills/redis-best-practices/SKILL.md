---
name: redis-best-practices
description: Redis best practices for caching, data structures, and in-memory data architecture
user-invocable: false
---

# Redis Best Practices

## Caching Patterns

### Cache-Aside (CRITICAL)
- Read: check cache → miss → read DB → set cache
- Write: update DB → invalidate cache
- Best for read-heavy workloads

### Write-Through
- Write: update cache AND DB simultaneously
- Ensures consistency
- Higher write latency

### Write-Behind
- Write: update cache → async DB update
- Lowest latency
- Risk of data loss

## Data Structures

### String
- Simple key-value: `SET key value`
- Counters: `INCR`, `DECR`, `INCRBY`
- Bit operations: `SETBIT`, `BITCOUNT`

### Hash
- Object storage: `HSET user:1 name "Alice"`
- Partial updates: `HINCRBY user:1 visits 1`
- Memory efficient for small hashes

### List
- Queues: `LPUSH`, `RPOP` (FIFO)
- Stacks: `LPUSH`, `LPOP` (LIFO)
- Capped collections: `LTRIM`

### Set
- Unique collections: `SADD`, `SMEMBERS`
- Intersections: `SINTER`
- Random sampling: `SRANDMEMBER`

### Sorted Set
- Leaderboards: `ZADD`, `ZRANGEBYSCORE`
- Rate limiting: `ZADD timestamp`
- Priority queues

### Stream
- Event log: `XADD`, `XREAD`
- Consumer groups: `XGROUP`, `XACK`
- Pub/Sub with persistence

## Performance

### Memory Optimization
- Set maxmemory policy: `allkeys-lru`, `volatile-lru`
- Monitor memory: `INFO memory`
- Use appropriate data structures (Hash vs String)

### Pipelining
- Batch multiple commands
- Reduces round-trip latency
- Use for bulk operations

## High Availability

### Redis Cluster
- Horizontal scaling
- Automatic sharding (16384 slots)
- Multi-master replication

### Redis Sentinel
- Automatic failover
- Monitoring and notifications
- Configuration provider

## References
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
