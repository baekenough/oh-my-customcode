# Apache Iceberg Guide

Reference documentation for Apache Iceberg open table format best practices.

## Source

Based on [Apache Iceberg official documentation](https://iceberg.apache.org/docs/latest/) and community best practices.

## Categories

| Priority | Category | Impact |
|----------|----------|--------|
| 1 | Table Maintenance | CRITICAL |
| 2 | Partition Management | CRITICAL |
| 3 | Schema Evolution | HIGH |
| 4 | File Optimization | HIGH |
| 5 | Catalog Management | MEDIUM |
| 6 | Integration Patterns | LOW-MEDIUM |

## Key Concepts

### Table Maintenance
- **Compaction**: rewrite_data_files to merge small files (target 256-512MB)
- **Snapshot Expiry**: expire_snapshots to clean old metadata
- **Orphan File Removal**: remove_orphan_files for storage cleanup
- **Sort Order Optimization**: sort data for query efficiency

### Partition Evolution
- Add, drop, or replace partition fields without data rewrite
- Hidden partitioning (no need for partition columns in queries)
- Partition transforms: identity, bucket, truncate, year/month/day/hour

### Schema Evolution
- Add, rename, reorder, drop columns safely
- Type promotion (int → long, float → double)
- Full schema evolution without table rewrite

## Usage

This guide is referenced by:
- **Agent**: de-snowflake-expert, de-pipeline-expert
- **Skill**: (referenced via agents)

## External Resources

- [Iceberg Official Docs](https://iceberg.apache.org/docs/latest/)
- [Iceberg Spec](https://iceberg.apache.org/spec/)
- [Iceberg Java API](https://iceberg.apache.org/docs/latest/api/)
- [Iceberg Community](https://iceberg.apache.org/community/)
