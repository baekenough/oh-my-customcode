---
title: Harness Synthesizer
type: skill
updated: 2026-04-18
sources:
  - .claude/skills/harness-synthesizer/SKILL.md
related:
  - [[action-validator]]
  - [[adaptive-harness]]
  - [[evaluator-optimizer]]
  - [[pipeline-guards]]
  - [[R021]]
---

# Harness Synthesizer

Synthesize executable validation harnesses for agent tool calls — AutoHarness-inspired verifier/filter/policy generation.

## Overview

Generates code-level YAML harnesses that validate agent tool calls before or after execution, reducing agent errors through structured constraint enforcement. Inspired by AutoHarness (Google DeepMind, arxiv 2603.03329). Follows R021's advisory-first enforcement model: default output is always advisory, with hard enforcement available only via explicit opt-in.

## Key Details

- **Scope**: core
- **Version**: 1.0.0
- **User-invocable**: yes
- **Effort**: high
- **Argument hint**: `[--mode verifier|filter|policy] [--agent <name>] [--dry-run]`

## Three Modes

| Mode | Enforcement | Behavior |
|------|-------------|----------|
| `verifier` (default) | Advisory | Post-hoc check: validates tool call results after execution; emits warnings |
| `filter` | Advisory (opt-in hard via `--hard-enforce`) | Pre-execution check: blocks invalid tool calls when `--hard-enforce` is passed |
| `policy` | Advisory | Suggests the best valid action from available options; ranks valid paths |

Filter mode without `--hard-enforce` emits warnings only. Adding `--hard-enforce` enables actual blocking.

## Workflow

1. Read target agent frontmatter — extract `tools`, `domain`, `limitations` fields
2. Analyze recent tool call patterns from `.claude/outputs/` session logs (if available)
3. Synthesize YAML harness matching agent's declared capabilities
4. Refine via evaluator-optimizer loop — 3 rounds max
5. Save to `.claude/outputs/harnesses/{agent-name}-{mode}.yaml`
6. Report harness summary and integration instructions

## Integration Points

| System | How |
|--------|-----|
| [[action-validator]] | Harness output feeds action-validator's code-verified mode |
| [[adaptive-harness]] | `--learn` flag auto-triggers harness-synthesizer for project-specific patterns |
| [[evaluator-optimizer]] | Provides iterative gradient-free refinement loop |
| [[pipeline-guards]] | Harness checks usable as pipeline quality gates |

## R021 Compliance

Default `verifier` mode never blocks tool execution. `filter` without `--hard-enforce` is advisory only. Hard enforcement requires explicit user opt-in (`--hard-enforce`). All harness output is git-untracked under `.claude/outputs/harnesses/`.

## Sources

- `.claude/skills/harness-synthesizer/SKILL.md` — full skill definition with YAML examples
