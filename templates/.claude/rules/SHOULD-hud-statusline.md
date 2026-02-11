# [SHOULD] HUD Statusline Rules

> **Priority**: SHOULD | **ID**: R012

## Format

```
─── [Agent] {name} | [Progress] {n}/{total} | [Parallel] {count} ───
```

## When to Display

Multi-step tasks, parallel execution, long-running operations. Skip for single brief operations.

## Hook Implementation

Implemented in `.claude/hooks/hooks.json` (PreToolUse → Task matcher):

```
─── [Spawn] {subagent_type}:{model} | {description} ───
─── [Resume] {subagent_type}:{model} | {description} ───
```

## Display with Parallel

```
─── [Agent] secretary | [Parallel] 4 ───
  [1] Task(mgr-creator):sonnet → Create agent
  [2] Task(lang-golang-expert):haiku → Code review
```

Integrates with R007 (Agent ID), R008 (Tool ID), R009 (Parallel).
