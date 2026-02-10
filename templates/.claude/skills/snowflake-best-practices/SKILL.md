---
name: snowflake-best-practices
description: Snowflake best practices for cloud data warehouse design, query optimization, and cost management
user-invocable: false
---

# Snowflake Best Practices

## Warehouse Design

### Sizing (CRITICAL)
- Start small (XS or S), scale up as needed
- Enable auto-scaling for concurrency
- Enable auto-suspend (1 minute idle)
- Separate warehouses for different workloads

### Multi-Cluster Warehouses
- Use for high concurrency (many users)
- Set min/max clusters based on load
- Scaling policy: Standard (default) or Economy

## Query Optimization

### Clustering Keys (CRITICAL)
- Define clustering keys for frequently filtered columns
- Improves micro-partition pruning
- Monitor clustering depth
- Automatic clustering: `ALTER TABLE ... CLUSTER BY (...)`

### Result Caching
- 24-hour cache for identical queries
- Use SHOW PARAMETERS to check cache status
- Bypass cache with query hint: `/*+ NO_RESULT_CACHE */`

### Materialized Views
- For repeated aggregations
- Automatically refreshed on base table changes
- Cost: storage + refresh compute

## Data Loading

### COPY INTO (CRITICAL)
- Batch load from stages (S3/GCS/Azure)
- File size: 100-250MB compressed (optimal)
- Use pattern matching for multiple files

### Snowpipe
- Continuous ingestion
- Event-driven (S3 notifications)
- Serverless compute

## Cost Optimization

### Resource Monitors
- Set credit quotas per warehouse
- Alerts and suspend actions
- Track consumption with WAREHOUSE_METERING_HISTORY

### Storage
- Use zero-copy cloning for dev/test
- Time travel retention: 1 day (standard), 90 days (enterprise)
- Fail-safe: 7 days (not configurable)

## References
- [Snowflake Best Practices](https://docs.snowflake.com/en/user-guide/best-practices)
