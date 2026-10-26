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

Two advisory PreToolUse hooks cover this area; both always exit 0 and never block. Since #1885 each delivers its warning as stdout JSON `hookSpecificOutput.additionalContext` (visible to the model) and prints nothing when silent.

- `.claude/hooks/scripts/destructive-git-guard.sh` (T2 from #1146) warns before Bash commands that can discard work (R001): `git reset --hard`, `git clean` with any short-flag cluster containing `f` (`-f`, `-df`, `-xdf`, ...) or `--force`, `git restore` in any form (R001 treats even `git restore <path>` without `--source` as destructive), `git checkout -- .`/`*`/`/`, and `git branch -D`. All forms accept `git -C <path>` (quoted paths too) and `git -c k=v`. `git clean -nf` also fires (conservative); `-n`, `--dry-run` and `-nd` stay silent. The count line (`/tmp/.claude-destructive-git-threshold-${PPID}` marker) appears once per session when the count reaches 3.
- `.claude/hooks/scripts/git-delegation-guard.sh` flags git write keywords (commit, branch, checkout, merge, tag, ...) in delegation prompts sent to agents other than `mgr-gitnerd` (R010). It skips keywords after a negation on the same line, keywords inside a prohibition block (a `Forbidden:`-style colon header runs to the next blank line or the next non-prohibition label line such as `Allowed:` or `Steps:`, while a prohibition label like `Never:` continues it; a `Forbidden`-style markdown heading covers only its first paragraph or list), read-only `git branch`/`git tag` queries (`--list`, `-l`, `--contains`, `--show-current`, `-a`, `-r`, `-v`, ...; for `git branch` only, not when the same command also has `-d`/`-D`/`--delete`/`-m`/`-M`/`-c`/`-C`), and bare `git tag`/`git branch` used as a noun. ``` fences never open or close blocks. `git -C <path>` and `git -c k=v` (quoted arguments too) are stripped first, and keywords need word boundaries (`git merge-base` and "legit commit" do not match). The count line appears once per session when the count reaches 3.
