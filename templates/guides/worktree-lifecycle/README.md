# Worktree Lifecycle Automation

## Overview

Three shell aliases for managing git worktree lifecycle in AI agent workflows: **spin** (create), **merge** (integrate), **clean** (remove). Builds on basic worktree knowledge from `guides/git-worktree-workflow/`.

## Aliases

### agent-spin — Create worktree for agent work

```bash
agent-spin() {
  local branch="$1"
  local base="${2:-develop}"
  local repo_name=$(basename "$(git rev-parse --show-toplevel)")
  local worktree_dir="../${repo_name}-${branch}"

  git fetch origin "$base"
  git worktree add -b "$branch" "$worktree_dir" "origin/$base"
  echo "Worktree ready: $worktree_dir (branch: $branch, base: $base)"
}
```

**Usage**: `agent-spin feature/session-autofix develop`

### agent-merge — Integrate worktree branch

```bash
agent-merge() {
  local branch="$1"
  local target="${2:-develop}"
  local repo_name=$(basename "$(git rev-parse --show-toplevel)")
  local worktree_dir="../${repo_name}-${branch}"

  # Switch to main worktree
  cd "$(git worktree list | head -1 | awk '{print $1}')"

  git checkout "$target"
  git merge --no-ff "$branch" -m "Merge branch '$branch' into $target"

  echo "Merged $branch into $target"
}
```

**Usage**: `agent-merge feature/session-autofix develop`

### agent-clean — Remove worktree and branch

```bash
agent-clean() {
  local branch="$1"
  local repo_name=$(basename "$(git rev-parse --show-toplevel)")
  local worktree_dir="../${repo_name}-${branch}"

  git worktree remove "$worktree_dir" --force
  git branch -d "$branch"

  echo "Cleaned: worktree $worktree_dir, branch $branch"
}
```

**Usage**: `agent-clean feature/session-autofix`

## Setup

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# Agent worktree lifecycle
source ~/dotfiles/agent-worktree.sh  # or inline the functions above
```

## Claude Code Integration

Claude Code's `EnterWorktree` / `ExitWorktree` tools provide built-in worktree support for subagents. The aliases above complement this for manual or hook-driven workflows.

| Method | Use Case |
|--------|----------|
| `EnterWorktree` tool | Agent-managed isolation (automatic) |
| `agent-spin` alias | Manual or hook-triggered worktree creation |
| Agent frontmatter `isolation: worktree` | Declarative per-agent isolation |

## Lifecycle Flow

```
agent-spin feature/x develop
  └── Work in isolated worktree
      └── Tests pass
          └── agent-merge feature/x develop
              └── agent-clean feature/x
```

## Best Practices

- Always base worktrees on `origin/develop` (not local) to avoid stale base
- Run tests in the worktree before merge
- Clean up worktrees promptly — orphaned worktrees accumulate disk usage
- For CI-driven flows, `agent-clean` should be in the finally/cleanup step

## Related

- `guides/git-worktree-workflow/` — Basic worktree commands and directory structure
- R006 `isolation: worktree` — Agent frontmatter isolation setting
- Claude Code `EnterWorktree` / `ExitWorktree` — Built-in tool support
