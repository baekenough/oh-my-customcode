---
title: Omcustom Auto-Improve
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/omcustom-auto-improve/SKILL.md
related:
  - [[omcustom-improve-report]]
  - [[sauron-watch]]
  - [[pr-auto-improve]]
  - [[r009]]
  - [[r010]]
  - [[r017]]
  - [[r020]]
---

# Omcustom Auto-Improve

`/omcustom:auto-improve` reads verified improvement suggestions produced by eval-core analysis, lets the user select which to apply, applies them in an isolated worktree, and opens a PR — it never pushes directly to `develop`.

## Overview

A 7-step workflow: (1) run eval-core `analyze --format json --save` and parse suggestions; (2) display a numbered list and let the user select `[1,2,3]` / `all` / `cancel`, filtering out any item that targets the auto-improve skill itself (self-reference guard, since a self-modifying suggestion could disable its own safety net); (3) transition selected items `proposed` → `approved` via the eval-core API; (4) enter an isolated worktree (`EnterWorktree`, branch `auto-improve-{YYYYMMDD}`) so failed attempts never touch the working tree; (5) fan out approved items to specialist subagents by `targetType` (`agent`/`skill`/`routing` → mgr-creator per [[r010]] Protected Paths, `model-escalation` → general-purpose), spawned in parallel up to 4 per [[r009]]; (6) delegate a full [[r017]] verification to `mgr-sauron` — PASS proceeds, FAIL offers `fix` (max 2 retry cycles), `reject` (transition to `rejected`, discard worktree), or `manual` (keep worktree for inspection); (7) delegate commit + PR creation to `mgr-gitnerd`, transition applied items to `applied` with a PR URL, and keep the branch. Design intent: every applied change is human-reviewable via PR before merge, and self-targeting suggestions are structurally excluded to prevent the improvement loop from disabling its own guardrails.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:auto-improve`
- **Effort**: high
- **Pipeline guards**: 20 items/run default, 50 hard cap; max 2 fix-retry cycles; rollback via `git revert` (mgr-gitnerd, post-merge)

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[omcustom-improve-report]] (upstream — supplies the analysis data this skill consumes), [[sauron-watch]] (verification pattern reused in Step 6), [[pr-auto-improve]]
- **See also**: [[r009]] (parallel subagent cap), [[r010]] (Protected Paths delegation to mgr-creator), [[r017]] (Step 6 full verification), [[r020]] (completion verification before PR)

## Sources

- `.claude/skills/omcustom-auto-improve/SKILL.md` — skill definition
