---
title: "Git Worktree Workflow Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/git-worktree-workflow/README.md
related:
  - [[mgr-gitnerd]]
---

# Git Worktree Workflow Guide

Reference documentation for using Git worktrees to manage multiple branches simultaneously without context switching.

## Overview

Git worktrees allow checking out multiple branches in separate sibling directories, enabling parallel work on features, hotfixes, and releases without stashing or committing incomplete work. This guide covers the recommended directory naming convention (`{repo-name}-{branch-suffix}`), basic worktree commands, and integration with Claude Code's `EnterWorktree`/`ExitWorktree` tools. Used by `mgr-gitnerd` and the `superpowers:using-git-worktrees` skill.

## Key Topics

- Creating worktrees for existing and new branches
- Recommended directory structure as siblings to the main repo
- Listing and removing worktrees, pruning stale references
- Claude Code `EnterWorktree`/`ExitWorktree` tool integration
- Worktree isolation and its agent isolation use case (R006)

## Relationships

- **Used by agents**: [[mgr-gitnerd]]
- **Related skills**: [[superpowers:using-git-worktrees]]
- **See also**: [[claude-code]], [[skill-bundle-design]]

## Sources

- `guides/git-worktree-workflow/README.md` — commands, directory structure, workflow patterns
