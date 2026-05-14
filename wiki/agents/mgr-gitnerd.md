---
title: mgr-gitnerd
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-gitnerd.md
related:
  - [[mgr-sauron]]
  - [[tool-npm-expert]]
  - [[mgr-creator]]
---

# mgr-gitnerd

Git operations and GitHub workflow specialist for commits, branches, PRs, and history management following GitHub flow best practices and conventional commits.

## Overview

`mgr-gitnerd` is the **required** agent for ALL git operations per R010 and R017. The orchestrator must never run git commands directly — all commits, pushes, branch operations, and PRs are delegated here. A critical safety rule: pushes are refused if `mgr-sauron:watch` has not been run first (R017 enforcement).

Capabilities include conventional commit messages, branch naming enforcement, PR creation with structured descriptions, GPG/SSH signing, cherry-pick/squash/history cleanup, and conflict resolution.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot modify source code, cannot create agents

## Commit Message Format

```
<type>(<scope>): <subject>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Types: feat, fix, docs, style, refactor, test, chore

## Safety Rules

- NEVER force push to main/master
- NEVER reset --hard without confirmation
- NEVER skip pre-commit hooks without reason
- REFUSE push if mgr-sauron:watch was not run

## Relationships

- **Depends on**: mgr-sauron verification (prerequisite for push)
- **Used by**: R010 delegation table ("Git operations"), R017 (commit/push gate), all agents needing git operations
- **See also**: [[mgr-sauron]] (verification prerequisite), [[tool-npm-expert]] (version commits/tags)

## Learned Patterns

### Release branch namespace conflict (#1141, v0.136.0)

The local `release` branch (file ref) conflicts with `release/v*` directory ref namespace creation.

- **Detection**: `fatal: cannot lock ref 'refs/heads/release/vX.Y.Z': 'refs/heads/release' exists`
- **Mitigation**: auto-dev.yaml release step prepends item 0 to force-delete the stale local branch before tag/branch operations. Unpushed commits are warned but force-delete proceeds.
- **Memory**: see `.claude/agent-memory/mgr-gitnerd/MEMORY.md` (locally untracked per project policy).

## Sources

- `.claude/agents/mgr-gitnerd.md` — agent definition
