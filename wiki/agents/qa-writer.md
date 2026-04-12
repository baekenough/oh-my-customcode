---
title: qa-writer
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/qa-writer.md
related:
  - [[qa-planner]]
  - [[qa-engineer]]
  - [[arch-documenter]]
---

# qa-writer

QA documentation specialist that transforms test plans from [[qa-planner]] into detailed, executable test cases, execution summary reports, defect reports, and coverage reports.

## Overview

`qa-writer` bridges planning and execution in the QA triad. It takes the YAML QA plan from [[qa-planner]] and produces detailed step-by-step test cases with data specifications and expected results, execution summary reports, defect documentation, regression test suites, environment specifications, and release readiness documents. Cannot execute tests or modify source code — output is documentation only.

Results are passed to [[qa-engineer]] for execution and archived to [[arch-documenter]].

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob (no Bash)
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot execute tests, cannot modify source code

## Relationships

- **Depends on**: QA plans from [[qa-planner]]
- **Used by**: `qa-lead-routing` skill (QA documentation tasks)
- **See also**: [[qa-planner]] (upstream plan source), [[qa-engineer]] (downstream execution consumer), [[arch-documenter]] (archive destination)

## Sources

- `.claude/agents/qa-writer.md` — agent definition
