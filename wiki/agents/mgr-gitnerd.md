---
title: mgr-gitnerd
type: agent
updated: 2026-07-29
sources:
  - .claude/agents/mgr-gitnerd.md
  - .claude/skills/pipeline/workflows/auto-dev.yaml
  - .github/workflows/auto-tag.yml
related:
  - [[mgr-sauron]]
  - [[tool-npm-expert]]
  - [[mgr-creator]]
  - [[r001]]
  - [[r017]]
  - [[git-safety]]
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
- **Memory**: local (`.claude/agent-memory-local/mgr-gitnerd/`, git-untracked — changed from `project` scope in v1.1.13 / #1468)
- **Effort**: medium
- **Max Turns**: 20
- **Permission Mode**: bypassPermissions
- **Limitations**: cannot modify source code, cannot create agents

## Commit Message Format

```
<type>(<scope>): <subject>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Types: feat, fix, docs, style, refactor, test, chore

## Safety Rules (expanded v0.136.1, #1146)

Nine-bullet safety rules enforcing [[r001]] Destructive Git Commands section:

- NEVER force push to main/master (use `--force-with-lease` only on feature branches with explicit user approval)
- NEVER `git reset --hard` without confirmation — verify `git status` shows clean tree OR user explicitly accepts loss
- NEVER `git checkout -- <path>` / `git restore <path>` without confirmation — uncommitted changes are unrecoverable
- NEVER `git clean -fd` without prior `git clean -nd` dry-run + user approval
- NEVER `git branch -D <branch>` without showing `git log <branch>` first if branch has unmerged commits
- NEVER skip pre-commit hooks without reason
- ALWAYS create new commits (avoid --amend unless requested)
- ALWAYS check `git reflog` before declaring work lost — most destructive ops are recoverable for 30 days
- Reference: [[r001]] Destructive Git Commands section, #1146 (v0.136.0 working tree loss incident)

For full pre-flight checks and recovery procedures, see [[git-safety]].

## Push Rules (R016)

All pushes require prior `mgr-sauron:watch` verification. If sauron was not run, REFUSE the push.

## Milestone Query Robustness (#1287)

When verifying milestone state (e.g., confirming closure after a release), `mgr-gitnerd` prefers a **number-based direct query** over title-matching list lookup:

- Preferred: `gh api repos/{owner}/{repo}/milestones/<number> --jq '.title, .state, .open_issues'` (deterministic)
- Fallback: title-matching `gh api "repos/{owner}/{repo}/milestones?state=all&per_page=100"` list lookup (can fail transiently)

If title-matching returns no results, do NOT immediately report the milestone as absent — retry once (transient jq/pagination timing), then fall back to number-based direct query before declaring "milestone does not exist." False "not found" reports can mislead the release milestone-close verification step (cf. [[r017]] Sync Verification).

Origin: #1287 (v0.164.0 session retrospective — milestone reported absent but confirmed present via direct re-query).

## PR Body Closes-Keyword Requirement (#1531)

`auto-tag.yml` closes issues by grep'ing `Closes|Fixes|Resolves #N` keywords in the merged PR body — NOT by milestone membership. When creating a release PR, `mgr-gitnerd` MUST include a `Closes #N` line for every issue the release resolves; a missing keyword lets the workflow report `success` while closing zero issues.

After merge, `mgr-gitnerd` verifies each targeted issue is actually `CLOSED` via `gh issue view` — workflow conclusion=success is not evidence of close (cf. [[r020]] "actual outcome ≠ attempt"). If an issue is still open, close it manually.

Origin: #1531 (v1.1.34 Closes-keyword omission left 5 issues open despite a green workflow; PR-body requirement + post-merge verification added in response).

## Relationships

- **Depends on**: mgr-sauron verification (prerequisite for push)
- **Used by**: R010 delegation table ("Git operations"), R016 (push gate), R017 (milestone-close verification), all agents needing git operations
- **See also**: [[mgr-sauron]] (verification prerequisite), [[tool-npm-expert]] (version commits/tags), [[git-safety]] (destructive op guide), [[r001]] (safety rules), [[r017]] (sync verification, milestone-close gate)

## Learned Patterns

### Release branch namespace conflict (#1141, v0.136.0)

The local `release` branch (file ref) conflicts with `release/v*` directory ref namespace creation.

- **Detection**: `fatal: cannot lock ref 'refs/heads/release/vX.Y.Z': 'refs/heads/release' exists`
- **Mitigation**: auto-dev.yaml release step prepends item 0 to force-delete the stale local branch before tag/branch operations. Unpushed commits are warned but force-delete proceeds.
- **Memory**: see `.claude/agent-memory-local/mgr-gitnerd/MEMORY.md` (local scope, git-untracked since v1.1.13 / #1468).

### rustup symlink multiplexer is not cache poisoning (#1148, v0.137.0)

`readlink -f $(which cargo) | grep -q "rustup-init"` returning true is **normal** rustup behavior — NOT an indicator of cache poisoning or misconfiguration.

- **Why**: rustup uses a single binary (`rustup-init`) with argv[0]-based multiplexing. All tool symlinks (`cargo`, `rustc`, etc.) resolve to `rustup-init` by design.
- **Anti-pattern**: Binary identity checks (`readlink`) for cargo verification — these produce false positives and caused PR #1143 CI failure (v0.136.0).
- **Correct approach**: Functional verification — `cargo --list | grep test` (subcommand existence). The actual #1140 regression symptom was `cargo test` returning `error: unexpected argument 'test' found`, not symlink mismatch.
- **Rule**: Use functional output verification, never binary identity path checks, for tool environment guards.

## Sources

- `.claude/agents/mgr-gitnerd.md` — agent definition
- Issue #1146 — v0.136.0 working tree loss incident (origin of expanded Safety Rules)
- Issue #1148 — rustup symlink false-positive CI failure (v0.137.0)
- Issue #1287 — milestone query false-negative retrospective (v0.164.0, origin of Milestone Query Robustness)
- Issue #1468 — memory scope migration to `local` (v1.1.13)
- Issue #1531 — PR-body Closes-keyword omission left 5 issues open despite green workflow (v1.1.34)
