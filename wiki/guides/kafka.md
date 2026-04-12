---
title: "Apache Kafka Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/kafka/README.md
related:
  - [[de-kafka-expert]]
  - [[kafka-best-practices]]
---

# Apache Kafka Guide

Reference documentation for Apache Kafka event streaming platform best practices and production patterns.

## Overview

Covers producer/consumer patterns, topic design (partition count, replication factor, retention), schema management with Confluent Schema Registry, Kafka Streams and Kafka Connect, and operational monitoring. Based on official Kafka documentation and Confluent best practices. Used by `de-kafka-expert` for event streaming architecture.

## Key Topics

- Producer patterns: idempotent producers, acks, batching, compression
- Consumer patterns: consumer groups, offset management, rebalancing
- Topic design: partition strategy, replication, compaction vs. delete
- Schema management: Avro/Protobuf with Schema Registry
- Kafka Streams and stateful processing
- Kafka Connect for source/sink connectors
- Security: TLS, SASL, ACLs

## Relationships

- **Used by agents**: [[de-kafka-expert]]
- **Related skills**: [[kafka-best-practices]]
- **See also**: [[spark]], [[airflow]], [[iceberg]]

## Sources

- `guides/kafka/README.md` — overview, categories, external resource links
