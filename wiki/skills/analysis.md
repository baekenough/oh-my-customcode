---
title: Analysis
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/analysis/SKILL.md
related:
  - [[mgr-creator]]
  - [[create-agent]]
  - [[update-docs]]
---

# Analysis

Analyze project and auto-configure agents, skills, rules, and guides.

## Overview

Scans a project's tech stack via indicator files and dependency manifests, compares against installed agents/skills, and auto-configures missing items. Four-step workflow: architecture interview (optional `--interview` flag), project scan (detects TypeScript, Python, Go, Rust, Docker, AWS, Airflow, dbt, etc.), gap analysis, and auto-configure. Reports additions and suggestions. Supports `--dry-run` and `--verbose` modes.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:analysis`
- **Effort**: not specified
- **Argument hint**: `[target-dir] [--interview]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[create-agent]], [[update-docs]], [[audit-agents]]
- **See also**: [[mgr-creator]], [[R006]]

## Sources

- `.claude/skills/analysis/SKILL.md` — skill definition
