---
title: qa-planner
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/qa-planner.md
related:
  - [[qa-writer]]
  - [[qa-engineer]]
  - [[arch-speckit-agent]]
---

# qa-planner

QA planning specialist for creating comprehensive test strategies from requirements — covering risk-based prioritization, test scenario identification, acceptance criteria definition, and resource estimation.

## Overview

`qa-planner` is the strategic head of the QA triad. It receives requirements/specifications and produces a structured QA plan with risk-based test prioritization, positive/negative/edge case scenarios, data dependency mapping, acceptance criteria definition (measurable, user-story-aligned), performance benchmarks, and security requirements. Cannot execute tests or modify code — its output is documentation only.

Outputs a YAML-structured QA plan consumed by [[qa-writer]] for detailed test case documentation.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob (no Bash)
- **Memory**: project
- **Effort**: high
- **Max Turns**: 20
- **Limitations**: cannot execute tests, cannot modify code

## Relationships

- **Depends on**: requirements/specifications, user stories
- **Used by**: `qa-lead-routing` skill (QA planning tasks)
- **See also**: [[qa-writer]] (receives QA plan, writes test cases), [[qa-engineer]] (receives priorities, executes tests), [[arch-speckit-agent]] (EARS acceptance criteria input)

## Sources

- `.claude/agents/qa-planner.md` — agent definition
