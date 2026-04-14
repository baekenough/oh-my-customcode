---
title: "Worktree Lifecycle Automation Guide"
type: guide
updated: 2026-04-14
sources:
  - guides/worktree-lifecycle/README.md
related:
  - [[git-worktree-workflow]]
  - [[mgr-gitnerd]]
---

# Worktree Lifecycle Automation Guide

Three shell aliases — `agent-spin`, `agent-merge`, `agent-clean` — that automate the full git worktree lifecycle for AI agent workflows.

## Overview

Builds on the foundational worktree commands in `guides/git-worktree-workflow/` by providing opinionated shell aliases for the three-phase lifecycle: create, integrate, and remove. Designed for use in manual or hook-driven workflows that complement Claude Code's built-in `EnterWorktree`/`ExitWorktree` tools.

## Three Aliases

| Alias | Phase | Action |
|-------|-------|--------|
| `agent-spin <branch> [base]` | Create | Fetch origin, create worktree in sibling directory, checkout new branch |
| `agent-merge <branch> [target]` | Integrate | Switch to main worktree, merge with `--no-ff` into target branch |
| `agent-clean <branch>` | Remove | Force-remove worktree directory, delete local branch |

Default base and target is `develop`. Worktrees are created as `../{repo-name}-{branch}` siblings.

## Lifecycle Flow

```
agent-spin feature/x develop
  → Work in isolated worktree → Tests pass
    → agent-merge feature/x develop
      → agent-clean feature/x
```

## Claude Code Integration

| Method | Use Case |
|--------|----------|
| `EnterWorktree(name:)` tool | Agent-managed isolation — create new worktree (automatic) |
| `EnterWorktree(path:)` tool | Enter existing worktree without creating a new branch (v2.1.105+) |
| `agent-spin` alias | Manual or hook-triggered creation |
| `isolation: worktree` frontmatter | Declarative per-agent isolation (R006) |

## Best Practices

- Always base on `origin/develop` (not local) to avoid stale base
- Run tests inside the worktree before `agent-merge`
- Call `agent-clean` in CI finally/cleanup steps to prevent orphaned worktrees

## Relationships

- **Extends**: [[git-worktree-workflow]] (basic worktree commands)
- **Used by**: [[mgr-gitnerd]] for automated branch operations
- **Rule reference**: R006 `isolation: worktree` agent frontmatter field

## Sources

- `guides/worktree-lifecycle/README.md` — alias implementations, setup, best practices
