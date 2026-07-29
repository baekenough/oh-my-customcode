---
title: qa-engineer
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/qa-engineer.md
related:
  - [[qa-planner]]
  - [[qa-writer]]
  - [[arch-documenter]]
  - [[autonomous-challenge-lessons]]
  - [[r020]]
  - [[dev-lead-routing]]
---

# qa-engineer

QA execution specialist that runs manual and automated tests, identifies and documents defects, and validates fixes against test plans produced by [[qa-planner]] and [[qa-writer]].

## Overview

`qa-engineer` is the execution arm of the QA triad, downstream of [[qa-planner]] (risk-based prioritization) and [[qa-writer]] (detailed test cases). It runs regression, acceptance, cross-browser, API, and security testing across Jest, Vitest, pytest, go test, JUnit, Playwright, and Cypress, then documents defects with severity classification and verifies fixes. Unlike its upstream QA peers, it holds Bash and can develop test scripts and integrate them into CI/CD, but it cannot modify source code in production branches.

The agent enforces a strict verification discipline before writing any QA report: it must grep/read the target implementation and quote selectors, identifiers, filenames, and commands verbatim, never inventing `data-testid`, DOM selectors, function names, or CLI flags from memory — a task-specific application of [[r020]]'s "actual outcome ≠ attempt" principle. It also has explicit tool-denial and repeated-failure handling: it does not retry an identical denied tool call, and after the same critical launch/runtime error appears twice it stops relaunching and re-checks flag semantics, existing processes, and environment assumptions. This discipline is generalized further in [[autonomous-challenge-lessons]] for long-running autonomous QA sessions.

## Key Details

- **Model**: claude-sonnet-5
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: local
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot modify source code in production branches

## Supported Frameworks

Jest, Vitest, pytest, go test, JUnit, Playwright, Cypress

## Relationships

- **Depends on**: test cases from [[qa-writer]], priorities from [[qa-planner]]
- **Used by**: `qa-lead-routing` skill (QA execution tasks)
- **Outputs to**: defects to [[dev-lead-routing]] (dev-lead), results back to [[qa-writer]]
- **See also**: [[qa-writer]] (upstream test case source, downstream results recipient), [[qa-planner]] (upstream priorities), [[dev-lead-routing]] (defect handoff target), [[arch-documenter]] (defect/results archive destination), [[autonomous-challenge-lessons]] (verification discipline generalized for long autonomous runs), [[r020]] (completion verification principle underlying the QA evidence discipline)

## Sources

- `.claude/agents/qa-engineer.md` — agent definition
