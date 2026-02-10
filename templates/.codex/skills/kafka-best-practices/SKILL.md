---
name: kafka-best-practices
description: Apache Kafka best practices for event streaming, topic design, and producer-consumer patterns
user-invocable: false
---

# Apache Kafka Best Practices

## Producer Patterns

### Idempotent Producer (CRITICAL)
- Enable `enable.idempotence=true`
- Prevents duplicate messages
- Requires `acks=all`, `retries > 0`, `max.in.flight.requests.per.connection <= 5`

### Exactly-Once Semantics
- Use transactional API: `initTransactions()`, `beginTransaction()`, `commitTransaction()`
- For exactly-once end-to-end processing

### Performance
- Batching: `linger.ms` (wait for batch to fill)
- Compression: `compression.type=snappy` or `lz4`
- `batch.size`: 16KB default, tune based on message size

## Consumer Patterns

### Offset Management
- Auto-commit: `enable.auto.commit=true` (at-least-once)
- Manual commit: `commitSync()` or `commitAsync()` (better control)

### Rebalancing
- Cooperative sticky assignor: minimal rebalancing disruption
- `session.timeout.ms` and `heartbeat.interval.ms` tuning

### At-Least-Once vs Exactly-Once
- At-least-once: default, idempotent processing required
- Exactly-once: transactional consumer + producer

## Topic Design

### Partitioning
- Partition count: based on throughput (MB/s ÷ partition throughput)
- Key-based partitioning for ordering guarantees
- More partitions = higher throughput (but more overhead)

### Retention
- Time-based: `retention.ms`
- Size-based: `retention.bytes`
- Log compaction: for changelog topics (`cleanup.policy=compact`)

## References
- [Kafka Documentation](https://kafka.apache.org/documentation/)
