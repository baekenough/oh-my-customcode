---
title: Omcustom Feedback
type: skill
updated: 2026-05-24
sources:
  - .claude/skills/omcustom-feedback/SKILL.md
related:
  - [[mgr-gitnerd]]
  - [[R016]]
---

# Omcustom Feedback

Submit feedback as a GitHub Issue for tracking and improvement — invocable by both user and model.

## Overview

Collects feedback (bug reports, feature requests, improvement suggestions) and creates a formatted GitHub Issue with appropriate labels. Guides through providing structured feedback: title, description, reproduction steps (for bugs), and expected behavior. Delegates issue creation to `mgr-gitnerd` via `gh issue create`. Supports the [[R016]] continuous improvement workflow.

As of #1226/#1227, `disable-model-invocation: true` was removed. The skill is now invocable by **both the user** (`/omcustom-feedback`) **and the model** (via the Skill tool). The primary new use case is **session-end retrospective feedback drafting**: the model can analyze the session and draft a feedback issue proposal automatically. The Phase 4A "Preview + confirmation" gate is the abuse-mitigation safety boundary — the model can draft but cannot create a public GitHub issue without explicit user confirmation.

## Key Details

- **Scope**: harness
- **User-invocable**: yes (`/omcustom-feedback`)
- **Model-invocable**: yes (via Skill tool — since #1226/#1227, 2026-05-24)
- **Safety boundary**: Phase 4A Preview + confirmation gate (model cannot publish without user approval)
- **Primary model use case**: session-end retrospective feedback drafting
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[R016]]
- **See also**: [[mgr-gitnerd]]

## Sources

- `.claude/skills/omcustom-feedback/SKILL.md` — skill definition
