---
title: Worker Reviewer Pipeline
type: skill
updated: 2026-10-05
sources:
  - .claude/skills/worker-reviewer-pipeline/SKILL.md
related:
  - [[evaluator-optimizer]]
  - [[pipeline-guards]]
  - [[dag-orchestration]]
---

# Worker Reviewer Pipeline

Worker-Reviewer iterative pipeline for quality-gated code generation.

## Overview

Implements a worker-reviewer loop where a worker agent generates/modifies code and a reviewer agent evaluates it against quality criteria. The loop continues until the reviewer approves or max iterations is reached (default 3, hard cap 5 per pipeline-guards). Reviewer findings are fed back to the worker for targeted improvements. Supports configurable quality gates and escalation to higher-tier models on repeated failure. In Agent Teams mode, a member lacking SendMessage hands off via artifact files relayed by the orchestrator, and when TaskList is absent the team follows R018 "Task 도구 부재 시 대체 규약" (#1817, #1582). Per-call `mode: "bypassPermissions"` is required on CC < 2.1.212 and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (agent frontmatter `permissionMode` may adjust it); verify the effective mode before unattended runs ([[r010]] "Universal bypassPermissions", #1818).

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator (via `pipeline` or direct invocation)
- **Related skills**: [[evaluator-optimizer]], [[pipeline-guards]], [[dag-orchestration]], [[model-escalation]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/worker-reviewer-pipeline/SKILL.md` — skill definition
