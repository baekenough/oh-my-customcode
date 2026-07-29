---
title: arch-speckit-agent
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/arch-speckit-agent.md
related:
  - [[arch-documenter]]
  - [[qa-planner]]
  - [[sdd-dev]]
---

# arch-speckit-agent

Spec-Driven Development (SDD) agent that transforms requirements into executable specifications using the `speckit` toolchain, defining project constitutions, technical plans, and TDD task lists.

## Overview

`arch-speckit-agent` implements the `/sdd-dev` skill workflow by wrapping the external [spec-kit](https://github.com/github/spec-kit) CLI tool. It guides development from raw requirements through a structured 7-step pipeline: `specify init` → constitution → specify → clarify → plan → tasks → implement.

A key differentiator is support for EARS (Easy Approach to Requirements Syntax) notation — five patterns (Ubiquitous, Event-driven, State-driven, Optional, Complex) — for writing unambiguous, testable acceptance criteria applied to spec output's `invariants` and `acceptance_criteria` sections. The agent cannot execute code or deploy infrastructure — its output is exclusively specification artifacts, capped at 20 turns per invocation.

## Key Details

- **Model**: claude-sonnet-5
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: local (`.claude/agent-memory-local/`, git-untracked)
- **Effort**: high
- **Max turns**: 20
- **Permission mode**: bypassPermissions
- **Source**: external from `https://github.com/github/spec-kit`
- **Prerequisites**: Python 3.14+, uv, Git
- **Limitations**: cannot execute code, cannot deploy infrastructure

## Commands

| Command | Purpose |
|---------|---------|
| `/speckit.constitution` | Define project principles |
| `/speckit.specify` | Define WHAT to build |
| `/speckit.clarify` | Clarify requirements (Q&A) |
| `/speckit.plan` | Define HOW to build |
| `/speckit.tasks` | Generate TDD task list |
| `/speckit.implement` | Execute all tasks |
| `/speckit.analyze` | Check spec consistency |
| `/speckit.checklist` | Generate QA checklist |

## Relationships

- **Depends on**: `spec-kit` external CLI tool (`uv tool upgrade specify-cli --from git+https://github.com/github/spec-kit.git`)
- **Used by**: [[sdd-dev]] skill, [[arch-documenter]] (documentation of resulting plans)
- **See also**: [[qa-planner]] (test strategy from specs), [[arch-documenter]] (documentation output)

## Sources

- `.claude/agents/arch-speckit-agent.md` — agent definition
