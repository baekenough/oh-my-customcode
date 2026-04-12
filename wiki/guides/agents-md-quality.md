---
title: "Agent Definition Quality Standards Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/agents-md-quality/README.md
related:
  - [[r006]]
  - [[r017]]
  - [[mgr-creator]]
  - [[mgr-supplier]]
  - [[mgr-sauron]]
---

# Agent Definition Quality Standards Guide

Quality criteria for `.claude/agents/*.md` files based on ETH Zurich research on LLM-generated agent configurations, adapted to oh-my-customcode's "create, connect, use" philosophy.

## Core Principle: LLM Generation + Mandatory Verification

Pure LLM-generated agent files perform worse than human-crafted ones (ETH Zurich finding). The project adapts this by making `mgr-creator` the generator and `mgr-sauron` the mandatory verifier. Generation is the workflow; verification is non-negotiable.

## Four-Section Structure

Every agent body SHOULD include these conceptual sections:

| Section | Purpose |
|---------|---------|
| **STYLE** | Communication preferences, verbosity, output format |
| **GOTCHAS** | Known pitfalls, edge cases, external dependencies |
| **ARCH_DECISIONS** | Why the agent is designed this way (model choice, skill selection, memory scope) |
| **TEST_STRATEGY** | How to verify the agent works, including edge cases |

## Frontmatter Quality Checklist

| Field | Required | Quality Check |
|-------|----------|---------------|
| `name` | Yes | Matches filename (kebab-case) |
| `description` | Yes | Specific, 10-80 characters |
| `model` | Yes | Justified by task complexity |
| `tools` | Yes | Minimal set (no unnecessary tools) |
| `limitations` | No | At least 1 for complex agents |

## Anti-Patterns to Avoid

| Anti-Pattern | Problem |
|-------------|---------|
| Kitchen-sink tools | Include only tools the agent actually needs |
| Vague description ("handles various tasks") | Be specific about the agent's domain |
| Copy-paste body from guides | Reference guides, don't duplicate them |
| Missing limitations | Unrealistic expectations cause routing failures |
| Orphaned skill references | Caught by `mgr-supplier` audit |
| 500+ line body | Move details to skills; keep agent body focused |

## Quality Metrics

| Metric | Target |
|--------|--------|
| Body length | 50-200 lines (excluding frontmatter) |
| Tool count | 3-8 |
| Description length | 10-80 characters |
| Skill references | All resolvable |

## Verification Workflow

`mgr-creator` generates → `mgr-sauron` verifies (R017) → optional human review → deploy.

## Relationships

- **Rules**: [[r006]] (frontmatter format), [[r017]] (sauron verification)
- **Agents**: [[mgr-creator]] (generation), [[mgr-sauron]] (verification), [[mgr-supplier]] (dependency audit)

## Sources

- `guides/agents-md-quality/README.md` — four-section structure, frontmatter checklist, anti-patterns, quality metrics
