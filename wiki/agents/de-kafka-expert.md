---
title: de-kafka-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/de-kafka-expert.md
related:
  - [[de-spark-expert]]
  - [[de-pipeline-expert]]
  - [[be-fastapi-expert]]
---

# de-kafka-expert

Expert Apache Kafka developer for event streaming architectures, topic design, producer-consumer patterns, schema management, and Kafka Streams/Connect pipelines.

## Overview

`de-kafka-expert` builds high-throughput, reliable Kafka-based streaming systems. It covers idempotent producers with exactly-once semantics, consumer group management with proper offset handling, topic design (partition sizing, replication, retention, compaction), Schema Registry integration with Avro/Protobuf evolution, Kafka Streams topology design, Connect pipelines with SMTs, and CQRS event-driven patterns.

Uses `kafka-best-practices` skill and `guides/kafka/` for reference documentation.

## Key Details

- **Model**: sonnet
- **Domain**: data-engineering
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `kafka-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `kafka-best-practices` skill, `guides/kafka/`
- **Used by**: `de-lead-routing` skill (Kafka/streaming task routing), [[de-pipeline-expert]] (streaming pipeline architecture)
- **See also**: [[de-spark-expert]] (Spark Structured Streaming consumer), [[de-pipeline-expert]] (overall pipeline architecture)

## Sources

- `.claude/agents/de-kafka-expert.md` — agent definition
