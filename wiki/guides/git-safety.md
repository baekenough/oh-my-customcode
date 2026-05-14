---
title: "Git Safety Guide"
type: guide
updated: 2026-05-15
sources:
  - guides/git-safety/README.md
related:
  - [[r001]]
  - [[mgr-gitnerd]]
  - [[r010]]
  - [[r017]]
---

# Git Safety Guide

Reference for safe git operations in autonomous AI agent flows. Born from #1146 (v0.136.0 working tree loss incident).

## Overview

This guide catalogs destructive git commands that require explicit user approval before execution, along with pre-flight checks and recovery procedures. It exists because `git reset --hard` executed by an autonomous agent caused working tree loss in v0.136.0 — most destructive git operations are irreversible without reflog recovery within 30 days.

## Destructive Commands Quick Reference

| Command | Risk | Required Action |
|---------|------|----------------|
| `git reset --hard <ref>` | Erases uncommitted + committed local changes | Confirm `git status` clean; show ref delta; explicit user approval |
| `git checkout -- <path>` / `git restore <path>` | Discards uncommitted file changes | Confirm intentional revert; explicit approval |
| `git clean -fd` / `-fdx` | Permanently deletes untracked files | Run `git clean -nd` dry-run first; explicit approval |
| `git branch -D <name>` (unmerged) | Loses unmerged work | Show `git log <branch>` first; confirm pushed elsewhere |
| `git push --force` (shared branch) | Rewrites shared history | NEVER on main/master; explicit approval for feature branches |

## Pre-Flight Checks

Before any destructive operation:

```bash
git status --porcelain | wc -l   # MUST be 0 for safe destructive op
git stash list                   # check if work was previously stashed
git reflog -n 20                 # baseline before any history-rewriting op
```

## Recovery Procedures

**From `git reset --hard`:** `git reflog` → find pre-reset SHA → `git reset --hard <pre-reset-sha>`.

**From `git clean -fd`:** Permanent. Recovery requires editor history, filesystem snapshots, or container layer cache.

**From `git branch -D` (unmerged):** `git reflog` → find branch tip SHA → `git branch <name> <sha>`.

**From orphaned commits:** `git fsck --lost-found` → `git show <sha>` → `git branch recovered <sha>`.

## Agent-Specific Rules

1. Pre-check is mandatory — never assume "small change"
2. Report uncommitted state — show `git status` output before destructive ops
3. Stash before reset — `git stash push -u "pre-reset-<reason>"` is cheap insurance
4. Reflog baseline — capture `git reflog -n 5` before any history-rewriting op

## Relationships

- **Enforced by**: [[r001]] Destructive Git Commands section (added v0.136.1, #1146)
- **Implemented by**: [[mgr-gitnerd]] Safety Rules section (9-bullet expanded form)
- **Push gate**: [[r017]] requires mgr-sauron:watch before every push
- **Delegation rule**: [[r010]] mandates all git ops go through mgr-gitnerd

## Sources

- `guides/git-safety/README.md` — full reference with code examples and recovery pseudo-code
- Issue #1146 — v0.136.0 working tree loss incident (origin of this guide)
- v0.136.1 — release that formalized safety rules across R001 and mgr-gitnerd
