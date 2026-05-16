---
title: "Agent Workflow Guide"
type: guide
updated: 2026-05-16
sources:
  - guides/agent-workflow/05-autonomous-challenge-lessons.md
related:
  - [[autonomous-challenge-lessons]]
  - [[qa-engineer]]
  - [[r020]]
---

# Agent Workflow Guide

Operational guidance for long-running autonomous agent sessions, challenge-style work, and QA-heavy tool workflows.

## Overview

The agent workflow guide collects lessons that reduce wasted autonomous cycles and prevent evidence drift. The current source focuses on the Minecraft Cobblemon autonomous run post-mortem (#1149), especially early ground-truth inspection, repeated failure handling, and QA evidence discipline.

## Key Practices

- Check provided artifacts, fixtures, golden outputs, binaries, or expected patches in the first five minutes.
- Do not retry denied or repeatedly failing tool calls without changing route or assumptions.
- Quote implementation identifiers from actual source or command output, not from screenshots or memory.
- Re-check version, mapping, and environment assumptions at major phase boundaries.

## Pages

- [[autonomous-challenge-lessons]] — detailed guardrails from the Cobblemon autonomous challenge post-mortem.

## Sources

- `guides/agent-workflow/05-autonomous-challenge-lessons.md` — first-five-minutes checks, repeated failure policy, QA evidence discipline, and long-run checkpoints.
