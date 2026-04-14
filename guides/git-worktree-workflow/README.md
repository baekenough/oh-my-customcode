# Git Worktree Workflow

## Overview

Git worktrees allow you to check out multiple branches simultaneously in separate directories, each with its own working tree. This eliminates the need to stash changes or commit incomplete work when switching between branches.

**Key benefits:**
- Work on `develop` and `team-plugin` simultaneously without context switching
- Keep long-running feature branches open alongside hotfix branches
- Run tests on one branch while coding on another

## Recommended Directory Structure

```
~/workspace/projects/
├── oh-my-customcode/                    # Main worktree (develop)
├── oh-my-customcode-team-plugin/        # team-plugin branch
└── oh-my-customcode-release/            # release/* branches
```

Convention: `{repo-name}-{branch-suffix}` as sibling directories to the main worktree.

## Basic Commands

### Create a worktree

```bash
# From the main repository directory
cd ~/workspace/projects/oh-my-customcode

# Attach to an existing remote branch
git worktree add ../oh-my-customcode-team-plugin team-plugin

# Create a new branch and worktree together
git worktree add ../oh-my-customcode-release release/v0.43.0
```

### List worktrees

```bash
git worktree list
```

Output:
```
/Users/you/workspace/projects/oh-my-customcode                 abc1234 [develop]
/Users/you/workspace/projects/oh-my-customcode-team-plugin     def5678 [team-plugin]
/Users/you/workspace/projects/oh-my-customcode-release         ghi9012 [release/v0.43.0]
```

### Remove a worktree

```bash
# Remove after branch is merged
git worktree remove ../oh-my-customcode-release

# Clean up stale worktree references
git worktree prune
```

### Move a worktree

```bash
git worktree move ../oh-my-customcode-release ../oh-my-customcode-hotfix
```

## Claude Code Integration

### Built-in Worktree Tools

Claude Code provides `EnterWorktree` and `ExitWorktree` tools for session-scoped worktree management:

```
EnterWorktree(name: "feature-x")
# Creates .claude/worktrees/feature-x with a new branch based on HEAD
# Session working directory switches to the worktree

EnterWorktree(path: "/absolute/path/to/existing-worktree")
# Switches into an existing worktree of the current repository (v2.1.105+)
# No new branch is created — uses the worktree as-is

ExitWorktree()
# Returns to the main repository
# Prompts to keep or remove the worktree
```

### Agent Isolation Mode

Agents can use `isolation: worktree` in their frontmatter to run in an isolated git worktree:

```yaml
---
name: my-agent
isolation: worktree
---
```

This gives the agent a separate working copy, enabling safe code changes with rollback capability. The worktree is automatically created and cleaned up by the agent lifecycle.

### Superpowers Skill

The `superpowers` plugin includes a `using-git-worktrees` skill with additional patterns for worktree-based workflows. Reference it for advanced use cases like parallel CI testing and multi-branch refactoring.

## Caveats

### Same branch restriction

A branch cannot be checked out in multiple worktrees simultaneously. Attempting this will fail:

```bash
# ERROR: 'develop' is already checked out at '~/workspace/projects/oh-my-customcode'
git worktree add ../oh-my-customcode-dev2 develop
```

### Independent dependencies

Each worktree has its own `node_modules`. Run package installation separately:

```bash
cd ../oh-my-customcode-team-plugin
bun install
```

### Gitignored files

Files under `.claude/` are gitignored in this project. When adding new `.claude/` files, use `git add -f`:

```bash
git add -f .claude/agents/new-agent.md
```

### Shared git objects

All worktrees share the same `.git` object store. Operations like `git gc` and `git fetch` affect all worktrees.

### Worktree-local files

Files listed in `.gitignore` (like `node_modules/`, `.env`) are independent per worktree. Configuration files that are not tracked must be set up separately in each worktree.
