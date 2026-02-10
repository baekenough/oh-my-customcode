---
name: dbt-best-practices
description: dbt best practices for SQL modeling, testing, and analytics engineering workflows
user-invocable: false
---

# dbt Best Practices

## Project Structure

### Layer Organization (CRITICAL)
- **Staging**: 1:1 with source tables (`stg_{source}__{entity}`)
- **Intermediate**: Business logic composition (`int_{entity}_{verb}`)
- **Marts**: Final consumption models (`fct_{entity}`, `dim_{entity}`)

### Materialization Strategy
- Staging: `view` (lightweight, always fresh)
- Intermediate: `ephemeral` or `view`
- Marts: `table` or `incremental`

## Modeling Patterns

### Naming Conventions
- Staging: `stg_source__table`
- Intermediate: `int_entity_verb`
- Facts: `fct_entity`
- Dimensions: `dim_entity`

### Incremental Models
- Use `is_incremental()` macro
- Define `unique_key` for merge strategy
- Choose strategy: append, merge, delete+insert

## Testing

### Schema Tests
- `unique`, `not_null` for primary keys
- `relationships` for foreign keys
- `accepted_values` for enums
- Custom data tests

### Source Freshness
- Configure `loaded_at_field`
- Set freshness thresholds

## Documentation

- Add descriptions to models
- Document column definitions
- Use `doc` blocks for reusable text
- Generate and host dbt docs

## References
- [dbt Best Practices](https://docs.getdbt.com/guides/best-practices)
