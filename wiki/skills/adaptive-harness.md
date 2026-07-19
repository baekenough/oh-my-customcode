---
title: Adaptive Harness
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/adaptive-harness/SKILL.md
related:
  - [[analysis]]
  - [[r016]]
  - [[mgr-creator]]
  - [[mgr-sauron]]
  - [[harness-eval]]
  - [[agent-eval-framework]]
  - [[harness-engineering]]
---

# Adaptive Harness

Auto-detects a target project's tech stack and optimizes the oh-my-customcode harness to fit it — deactivating agents the project doesn't need, flagging missing experts as gaps, and persisting a project profile that drives future activation decisions.

## Overview

The skill (`/omcustom:adaptive-harness`, scope `harness`, `effort: high`) writes and maintains `.claude/project-profile.yaml` in the TARGET project (never the harness itself), merging new detections into any manual edits rather than overwriting.

| Flag | Effect |
|------|--------|
| `--scan` | Read/Glob/Grep only, no writes — matches manifest files to a fixed indicator table, records `detection_evidence` with confidence, writes/merges the profile |
| `--optimize` | Diffs `active_agents` (profile) against `.claude/agents/*.md`; moves non-active, non-protected agents to `.claude/agents/.inactive/` (delegated per R010); flags missing active agents as gaps |
| `--learn` | Mines `.claude/outputs/`, `.claude/agent-memory/`, and eval output for `usage_stats`/`failure_patterns`; suggests rule overrides or model escalation |
| `--export` / `--import` | Bundles/applies the profile + active-agent list across projects |

Default (no flag) runs `--scan` then `--optimize`. `--dry-run` suppresses all writes. `--optimize --restore` reverses the last deactivation. Manager/system agents (`mgr-creator`, `mgr-gitnerd`, `mgr-sauron`, `mgr-supplier`, `mgr-updater`, `mgr-claude-code-bible`, `sys-memory-keeper`, `sys-naggy`, `arch-documenter`, `arch-speckit-agent`) are unconditionally protected from deactivation.

## Relationships

- **Invoked by**: [[analysis]] (`/omcustom:analysis` calls `--scan` after its own tech-stack pass)
- **Triggered by**: `SessionStart` hook `adaptive-harness-scan.sh` — lightweight profile existence check only, not a full scan
- **Delegates gaps to**: [[mgr-creator]] when `--optimize` finds an active agent missing from `.claude/agents/`
- **Followed by**: [[mgr-sauron]] structural verification (R017) after `--optimize` moves files
- **Feeds**: [[r016]] — failure patterns from `--learn` may trigger rule updates
- **Data sources for `--learn`**: [[harness-eval]] and [[agent-eval-framework]] output
- **Positioned in**: [[harness-engineering]] guide, Project Profile Learning perspective

## Notes

Writes (profile, `.inactive/` moves, `.claude/outputs/harness-adaptations/YYYY-MM-DD.md` log) are direct under `mode: "bypassPermissions"` (CC v2.1.121+) — no `/tmp/*.sh` wrapper needed. `.inactive/` is git-tracked so deactivation history is visible.

## Sources

- `.claude/skills/adaptive-harness/SKILL.md` — skill definition
