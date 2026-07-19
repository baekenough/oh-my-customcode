---
title: de-kafka-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/de-kafka-expert.md
related:
  - [[de-spark-expert]]
  - [[de-pipeline-expert]]
  - [[be-fastapi-expert]]
---

# de-kafka-expert

Expert Apache Kafka 4.x developer for event streaming architectures, topic design, producer-consumer patterns, schema management, and Kafka Streams/Connect pipelines.

## Overview

`de-kafka-expert` builds high-throughput, reliable Kafka-based streaming systems on Kafka 4.x, which uses KRaft (Kafka Raft) as the default metadata management — ZooKeeper has been fully removed. It covers idempotent producers with exactly-once semantics, consumer group management with proper offset handling, topic design (partition sizing, replication, retention, compaction), Schema Registry integration with Avro/Protobuf evolution, Kafka Streams topology design, Connect pipelines with SMTs, KRaft cluster deployment, and CQRS event-driven patterns.

Uses `kafka-best-practices` skill and `guides/kafka/` for reference documentation.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `kafka-best-practices`
- **Memory**: local (agent-memory-local, not git-tracked; changed from `project` in v1.1.13)
- **Effort**: high

## Relationships

- **Depends on**: `kafka-best-practices` skill, `guides/kafka/`
- **Used by**: `de-lead-routing` skill (Kafka/streaming task routing), [[de-pipeline-expert]] (streaming pipeline architecture)
- **See also**: [[de-spark-expert]] (Spark Structured Streaming consumer), [[de-pipeline-expert]] (overall pipeline architecture)

## Sources

- `.claude/agents/de-kafka-expert.md` — agent definition
