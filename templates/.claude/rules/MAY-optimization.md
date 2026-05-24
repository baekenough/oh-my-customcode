# [MAY] Optimization Guide

> **Priority**: MAY | **ID**: R005

## Efficiency

| Strategy | When | Example |
|----------|------|---------|
| Parallel | 3+ independent I/O tasks | Read multiple files simultaneously |
| Caching | Same data accessed repeatedly | Cache file contents, reuse search results |
| Lazy Loading | Large datasets, partial use | Read only needed files, stream results |

### Capability-Aware Tool Scheduling

When dispatching parallel tool calls, consider per-tool capabilities to optimize scheduling:

| Capability | Parallelizable? | Example |
|-----------|----------------|---------|
| Read-only, no side effects | Yes | Read, Glob, Grep |
| Write with independent targets | Yes | Write(file-A) + Write(file-B) |
| Write with shared target | No | Sequential edits to same file |
| External with rate limits | Throttle | WebFetch, API calls |

This aligns with R009 (parallel execution) detection criteria and extends it with tool-level scheduling awareness.

Inspired by [ouroboros PR #353](https://github.com/Q00/ouroboros/pull/353) capability graph pattern.

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

## Context Optimization via HTML Comments (v2.1.72+)

HTML comments in all auto-injected .md files (CLAUDE.md and rules/*.md) are hidden from the model during auto-injection but visible via Read tool.

| Use Case | Example |
|----------|---------|
| Metadata tags | `<!-- agents: 44, skills: 74 -->` in CLAUDE.md |
| Validation checksums | `<!-- validate-docs: hash=abc123 -->` in CLAUDE.md |
| Conditional context | `<!-- detailed-architecture: see guides/architecture/ -->` in CLAUDE.md |
| Rule detail hiding | `<!-- DETAIL: Self-Check ... -->` in rules/*.md |

**Rule**: Move model-unnecessary metadata into HTML comments to reduce context token usage. Keep actionable instructions as visible text.
