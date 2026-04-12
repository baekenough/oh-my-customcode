---
title: arch-speckit-agent
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/arch-speckit-agent.md
related:
  - [[arch-documenter]]
  - [[qa-planner]]
---

# arch-speckit-agent

Spec-Driven Development (SDD) agent that transforms requirements into executable specifications using the `speckit` toolchain, defining project constitutions, technical plans, and TDD task lists.

## Overview

`arch-speckit-agent` implements the `/sdd-dev` skill workflow by wrapping the external [spec-kit](https://github.com/github/spec-kit) CLI tool. It guides development from raw requirements through a structured pipeline: constitution → specify → clarify → plan → tasks → implement.

A key differentiator is support for EARS (Easy Approach to Requirements Syntax) notation for writing unambiguous, testable acceptance criteria. The agent cannot execute code or deploy infrastructure — its output is exclusively specification artifacts.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: project
- **Effort**: high
- **Source**: external from `https://github.com/github/spec-kit`
- **Prerequisites**: Python 3.11+, uv, Git
- **Limitations**: cannot execute code, cannot deploy infrastructure

## Commands

| Command | Purpose |
|---------|---------|
| `/speckit.constitution` | Define project principles |
| `/speckit.specify` | Define WHAT to build |
| `/speckit.clarify` | Clarify requirements |
| `/speckit.plan` | Define HOW to build |
| `/speckit.tasks` | Generate TDD task list |
| `/speckit.implement` | Execute tasks |

## Relationships

- **Depends on**: `spec-kit` external CLI tool
- **Used by**: `/sdd-dev` skill, [[arch-documenter]] (documentation of resulting plans)
- **See also**: [[qa-planner]] (test strategy from specs), [[arch-documenter]] (documentation output)

## Sources

- `.claude/agents/arch-speckit-agent.md` — agent definition
