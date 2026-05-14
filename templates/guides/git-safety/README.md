# Git Safety Guide

Reference for safe git operations in autonomous AI agent flows. Born from #1146 (v0.136.0 working tree loss incident).

## Destructive Commands Quick Reference

| Command | Risk | Required Action |
|---------|------|----------------|
| `git reset --hard <ref>` | Erases uncommitted + committed local changes | Confirm `git status` clean; show ref delta; explicit user approval |
| `git checkout -- <path>` / `git restore <path>` | Discards uncommitted file changes | Confirm intentional revert; explicit approval |
| `git clean -fd` / `-fdx` | Permanently deletes untracked files | Run `git clean -nd` dry-run first; explicit approval |
| `git branch -D <name>` (unmerged) | Loses unmerged work | Show `git log <branch>` first; confirm pushed elsewhere |
| `git push --force` (shared branch) | Rewrites shared history | NEVER on main/master; explicit approval for collaborative branches |

## Pre-Flight Checks

Before any destructive operation:

```bash
git status --porcelain | wc -l   # MUST be 0 for safe destructive op
git stash list                   # check if work was previously stashed
git reflog -n 20                 # baseline before any history-rewriting op
```

## Recovery Procedures

### From `git reset --hard`

```bash
git reflog                       # find pre-reset SHA
git reset --hard <pre-reset-sha> # restore HEAD
```

Most operations are recoverable within 30 days (default reflog expiry).

### From `git clean -fd`

Untracked file deletion is **permanent**. Recovery requires:
- Editor history (VS Code, JetBrains)
- Filesystem snapshots (Time Machine, ZFS, btrfs)
- Container layer cache (if in Docker)

### From `git branch -D` (unmerged commits)

```bash
git reflog                       # find branch tip SHA
git branch <name> <sha>          # recreate branch
```

### From orphaned commits (no ref)

```bash
git fsck --lost-found            # find dangling commits
git show <sha>                   # inspect candidates
git branch recovered <sha>       # save as branch
```

## Agent-Specific Rules

For AI agents executing git in autonomous flows:

1. **Pre-check is mandatory** — never assume "small change"
2. **Report uncommitted state** — show `git status` output to user before destructive ops
3. **Stash before reset** — `git stash push -u "pre-reset-<reason>"` is cheap insurance
4. **Reflog baseline** — capture `git reflog -n 5` before any history-rewriting op

## Cross-References

- **R001** (`.claude/rules/MUST-safety.md`) — Destructive Git Commands section
- **mgr-gitnerd** (`.claude/agents/mgr-gitnerd.md`) — Safety Rules section
- **Issue #1146** — Original v0.136.0 working tree loss incident
- **mgr-gitnerd memory** (`.claude/agent-memory/mgr-gitnerd/MEMORY.md`) — Incident lessons

## Reference Implementation Patterns

### Safe reset wrapper (pseudo-code)

```bash
safe_reset() {
  local target=$1
  local dirty=$(git status --porcelain | wc -l)
  if [ "$dirty" -gt 0 ]; then
    echo "WARNING: $dirty uncommitted change(s). Stash or commit first."
    git status --short
    return 1
  fi
  echo "Reset preview:"
  git log HEAD..$target --oneline
  git log $target..HEAD --oneline
  read -p "Proceed? [y/N] " confirm
  [ "$confirm" = "y" ] && git reset --hard "$target"
}
```

### Destructive op detection (advisory)

See `.claude/hooks/scripts/git-delegation-guard.sh` for the existing R010 advisory pattern. A future `destructive-git-guard.sh` (T2 from #1146, deferred) will add R001 destructive-op-specific warnings.
