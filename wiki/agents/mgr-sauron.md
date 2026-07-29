---
title: mgr-sauron
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/mgr-sauron.md
related:
  - [[mgr-gitnerd]]
  - [[mgr-supplier]]
  - [[mgr-updater]]
  - [[mgr-claude-code-bible]]
  - [[mgr-creator]]
  - [[r017]]
  - [[r023]]
---

# mgr-sauron

Automated R017 verification specialist — the "all-seeing eye" that runs mandatory multi-round verification (5 manager rounds + 3 deep review rounds, with rounds 3-4 conditionally skipped when rounds 1-2 return 0 issues) before any commit or push.

## Overview

`mgr-sauron` is the system integrity guardian: no `git push` is permitted without `mgr-sauron:watch` passing first (enforced by [[mgr-gitnerd]]). It runs 5 rounds of manager checks (mgr-supplier:audit, mgr-updater:docs, mgr-claude-code-bible:verify) followed by 3 rounds of deep review (workflow alignment, reference integrity, philosophy compliance R006-R011) plus Claude-native compatibility verification — the full round-by-round procedure and report format live in the `sauron-watch` skill (single source of truth, R006 separation of concerns).

Beyond count/reference checks, it runs spec density analysis (flags agents with excessive inline implementation detail, R006) and structural linting: routing coverage / unreachable-agent detection, orphan skill detection, circular dependency checks, and context:fork cap verification. It auto-fixes simple issues (count mismatches, missing fields) but flags missing agent files, invalid memory scopes, and philosophy violations for manual review.

Cost-aware verification ([[r023]] shift-left, added v1.1.15/#1475): Round 3-4 re-verification is skipped when Rounds 1-2 return 0 issues, and Round 5 substitutes deterministic script output (verify-template-sync.sh, verify-wiki-sync.sh, verify-version-sync.sh, validate-docs.ts) for LLM re-derivation of count/template/wiki checks — no loss to verification coverage.

## Key Details

- **Model**: claude-opus-5
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `sauron-watch`
- **Memory**: local (`.claude/agent-memory-local/mgr-sauron/`, git-untracked — changed from `project` scope in v1.1.13 / #1468)
- **Effort**: medium
- **Max Turns**: 25
- **Permission Mode**: bypassPermissions

## Commands

| Command | Description |
|---------|-------------|
| `mgr-sauron:watch` | Full R017 verification (5+3 rounds) |
| `mgr-sauron:quick` | Quick single-pass check |
| `mgr-sauron:report` | Generate verification status report |

## Relationships

- **Depends on**: [[mgr-supplier]] (dependency audit), [[mgr-updater]] (docs sync), [[mgr-claude-code-bible]] (spec compliance)
- **Used by**: [[mgr-gitnerd]] (push prerequisite), `secretary` (orchestration coordination), R017 rule enforcement, `/omcustom:sauron-watch` command
- **See also**: [[mgr-creator]] (creation of verified agents), [[r017]] (sync verification rule this agent enforces), [[r023]] (verification ladder / shift-left cost-aware design)

## Sources

- `.claude/agents/mgr-sauron.md` — agent definition
