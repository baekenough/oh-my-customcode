---
title: mgr-sauron
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-sauron.md
related:
  - [[mgr-gitnerd]]
  - [[mgr-supplier]]
  - [[mgr-updater]]
  - [[mgr-claude-code-bible]]
---

# mgr-sauron

Automated R017 verification specialist — the "all-seeing eye" that runs mandatory multi-round verification (5 manager rounds + 3 deep review rounds) before any commit or push.

## Overview

`mgr-sauron` is the system integrity guardian. No git push is permitted without `mgr-sauron:watch` passing first (enforced by [[mgr-gitnerd]]). It orchestrates three phases: Phase 1 runs 5 rounds of manager checks (mgr-supplier:audit, mgr-updater:docs, mgr-claude-code-bible:verify); Phase 2 runs 3 rounds of deep review (workflow alignment, reference integrity, philosophy compliance R006-R011); Phase 2.5 verifies documentation accuracy; Phase 3 auto-fixes simple issues and generates a report.

It can auto-fix count mismatches, missing memory fields, and outdated doc references, but flags missing agent files, invalid memory scopes, and philosophy violations for manual review.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `sauron-watch`
- **Memory**: project
- **Effort**: high
- **Max Turns**: 25

## Commands

| Command | Description |
|---------|-------------|
| `mgr-sauron:watch` | Full R017 verification (5+3 rounds) |
| `mgr-sauron:quick` | Quick single-pass check |
| `mgr-sauron:report` | Generate verification status report |

## Relationships

- **Depends on**: [[mgr-supplier]] (dependency audit), [[mgr-updater]] (docs sync), [[mgr-claude-code-bible]] (spec compliance)
- **Used by**: [[mgr-gitnerd]] (push prerequisite), R017 rule enforcement, `/omcustom:sauron-watch` command
- **See also**: [[mgr-creator]] (creation of verified agents), [[mgr-supplier]], [[mgr-updater]]

## Sources

- `.claude/agents/mgr-sauron.md` — agent definition
