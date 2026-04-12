---
title: qa-engineer
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/qa-engineer.md
related:
  - [[qa-planner]]
  - [[qa-writer]]
  - [[db-alembic-expert]]
---

# qa-engineer

QA execution specialist that runs tests, identifies defects, classifies severity, validates fixes, and integrates automated testing into CI/CD pipelines.

## Overview

`qa-engineer` is the hands-on test execution agent in the QA triad. It receives test cases from [[qa-writer]] and priorities from [[qa-planner]], then executes manual and automated tests, identifies and documents defects with severity classifications, verifies fixes, and develops test scripts for CI/CD integration. It supports acceptance testing, cross-browser testing, API testing, and security testing.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot modify source code in production branches

## Supported Frameworks

Jest, Vitest, pytest, go test, JUnit, Playwright, Cypress

## Relationships

- **Depends on**: test cases from [[qa-writer]], test priorities from [[qa-planner]]
- **Used by**: `qa-lead-routing` skill (QA execution tasks), [[db-alembic-expert]] (migration test strategy)
- **See also**: [[qa-planner]] (test strategy), [[qa-writer]] (test documentation), `dev-lead` (defect reports)

## Sources

- `.claude/agents/qa-engineer.md` — agent definition
