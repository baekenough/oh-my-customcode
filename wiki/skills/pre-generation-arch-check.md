---
title: Pre-Generation Architecture Check
type: skill
updated: 2026-04-19
sources:
  - .claude/skills/pre-generation-arch-check/SKILL.md
related:
  - [[adversarial-review]]
  - [[deep-verify]]
  - [[structured-dev-cycle]]
  - [[R006]]
  - [[R010]]
---

# Pre-Generation Architecture Check

AASM-inspired pre-generation architecture guard — detects R006 separation-of-concerns and compilation metaphor violations before code generation begins.

## Overview

Fills the PRE-generation gap in the verification pipeline. While `adversarial-review` and `deep-verify` run post-generation, this skill acts as a "pre-compile lint" phase: it checks the request summary and target paths for architectural design violations before any file is written. Auto-invoked at structured-dev-cycle Phase 1.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Version**: 1.0.0
- **Invoked by**: [[structured-dev-cycle]] Phase 1 (planning phase)

## Anti-Patterns Detected

| Pattern | Severity | Signal |
|---------|----------|--------|
| Skill-in-Agent | WARN | Agent body > ~50 lines or contains code blocks / step sequences |
| Agent-in-Skill | WARN | SKILL.md frontmatter contains agent-only fields (`model:`, `tools:`, `memory:`) |
| Guide-in-Skill | WARN | SKILL.md contains reference prose sections > 100 lines |
| Cross-Concern Write Without mgr-creator | BLOCK | Target paths span 2+ protected directories in one request |
| Direct Orchestrator Write | BLOCK | Request implies orchestrator will write files directly |
| Spec-Build Confusion | WARN | Rule files modified in same commit as agent/skill/code files |

## Severity Levels

| Severity | Action |
|----------|--------|
| WARN | Advisory — proceed with caution, surface to user |
| BLOCK | Halt — requires architectural redesign before proceeding |

Consistent with R021 advisory-first enforcement model. Future promotion to a PreToolUse hook is possible if violation rates warrant.

## Relationships

- **Invoked by**: [[structured-dev-cycle]]
- **Post-generation counterparts**: [[adversarial-review]], [[deep-verify]]
- **Governed by**: [[R006]] (separation of concerns), [[R010]] (protected paths and delegation)
- **Source concept**: Contexty AASM (https://github.com/ttalkkak-lab/opencode-contexty)

## Sources

- `.claude/skills/pre-generation-arch-check/SKILL.md` — skill definition
