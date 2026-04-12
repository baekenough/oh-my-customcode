---
title: Kafka Best Practices
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/kafka-best-practices/SKILL.md
related:
  - [[de-kafka-expert]]
  - [[spark-best-practices]]
  - [[airflow-best-practices]]
---

# Kafka Best Practices

Apache Kafka best practices for event streaming, topic design, and consumer patterns.

## Overview

Reference patterns for Apache Kafka: topic partitioning strategy, producer configuration (acks, retries, idempotence), consumer group patterns, offset management, schema registry integration, exactly-once semantics, dead letter queues, and monitoring with JMX metrics. Used by `de-kafka-expert` when designing or reviewing streaming pipelines.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[de-kafka-expert]]
- **Related skills**: [[spark-best-practices]], [[airflow-best-practices]], [[pipeline-architecture-patterns]]
- **See also**: guides/kafka-best-practices/

## Sources

- `.claude/skills/kafka-best-practices/SKILL.md` — skill definition
