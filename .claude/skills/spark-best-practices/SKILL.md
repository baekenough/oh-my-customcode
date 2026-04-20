---
name: spark-best-practices
description: Apache Spark 4.0.2 best practices for PySpark and Scala distributed data processing
scope: core
user-invocable: false
---

# Apache Spark Best Practices

> **Version**: Spark 4.0.2. Key changes from Spark 3.x: ANSI mode is now **default** (stricter SQL type coercion and overflow checks), and Spark Connect provides a decoupled client-server protocol for remote Spark access.

## Performance Optimization

### Broadcast Joins (CRITICAL)
- Use `broadcast(small_df)` for small-large table joins
- Default broadcast threshold: 10MB (`spark.sql.autoBroadcastJoinThreshold`)
- Avoid broadcast for tables > 100MB

### Shuffles (CRITICAL)
- Minimize shuffles: expensive operations
- Use `coalesce()` to reduce partitions without shuffle
- Use `repartition()` only when necessary (causes shuffle)
- Predicate pushdown: filter before joins

### Caching
- Cache DataFrames used multiple times: `df.cache()` or `df.persist()`
- Choose storage level: MEMORY_ONLY, MEMORY_AND_DISK, DISK_ONLY
- Unpersist when done: `df.unpersist()`

## Resource Management

### Executor Configuration
- Executor memory: 80% of available memory per executor
- Executor cores: 4-5 cores per executor (optimal)
- Dynamic allocation: enable for varying workloads

### Partitioning
- Optimal partition size: 100-200MB
- Too few partitions: underutilized cluster
- Too many partitions: task overhead

## Data Processing

### UDFs
- Prefer built-in functions over UDFs
- Use Pandas UDF for vectorized operations
- Avoid Python UDFs (serialization overhead)

### Storage Formats
- Parquet: default for analytics (columnar, compression)
- ORC: alternative to Parquet
- Delta/Iceberg: ACID transactions, time travel

## References
- [Spark Performance Tuning](https://spark.apache.org/docs/latest/tuning.html)
