# [MAY] Optimization Guide

> **Priority**: MAY | **ID**: R005

## Efficiency

| Strategy | When | Example |
|----------|------|---------|
| Parallel | 3+ independent I/O tasks | Read multiple files simultaneously |
| Caching | Same data accessed repeatedly | Cache file contents, reuse search results |
| Lazy Loading | Large datasets, partial use | Read only needed files, stream results |

## Token Optimization

- Include only necessary info, remove duplicates, use summaries
- Concise expressions, minimize code blocks, no unnecessary repetition

## Task Optimization

- **Batch**: Group similar tasks (edit 10 files at once)
- **Incremental**: Process only changed parts

## When to Optimize

| Do | Don't |
|----|-------|
| Repetitive tasks, clear bottleneck, measurable gain | One-time tasks, already fast, complexity > benefit |

Readability > Optimization. No optimization without measurement.
