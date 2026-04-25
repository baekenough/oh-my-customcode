---
title: Agora
type: skill
updated: 2026-04-25
sources:
  - .claude/skills/agora/SKILL.md
related:
  - [[codex-exec]]
  - [[gemini-exec]]
  - [[adversarial-review]]
  - [[roundtable-debate]]
  - [[R018]]
---

# Agora

Multi-LLM adversarial consensus loop — 3+ LLMs compete to find flaws in designs/specs until unanimous agreement is reached.

## Overview

Spawns Claude (opus), Codex/GPT, and Gemini as competing reviewers who independently analyze a document, then cross-review each other's findings via peer messaging. Loops until all reviewers reach unanimous BUILD or BUILD WITH CHANGES verdict. Final output is a consensus report saved to `.claude/outputs/`. Requires Agent Teams and `codex-exec`/`gemini-exec` skills.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/omcustom:agora`
- **Effort**: max
- **Argument hint**: `<document-path> [--rounds N] [--severity-threshold HIGH]`
- **Source**: external (github: baekenough/baekenough-skills v1.0.0)

## Ontology Convergence (PoC)

Experimental early-exit mechanism: when all participant responses reach cosine similarity ≥ 0.95 (min 2 rounds), convergence is declared without requiring explicit unanimous agreement. Default disabled. Activate with `--ontology-convergence=true`. Reduces token cost by 2–3 rounds on converging discussions at the cost of embedding computation overhead and threshold tuning.

## Anti-Groupthink Mode

Activate with `--mode anti-groupthink`. Modifies the default convergence loop with:

| Mechanism | Behavior |
|-----------|----------|
| Devil's Advocate slot | `claude-critic` holds opposing position on all consensus attempts |
| Minority opinion protection | 1-agent views preserved; rejection requires 3 explicit justifications |
| Round soft cap | After round 3, unresolved areas marked "UNRESOLVED — BRANCHING DECISION NEEDED" |

**When to use vs [[roundtable-debate]]:**

| Situation | Recommended |
|-----------|-------------|
| Consensus *required*, but groupthink risk | `agora --mode anti-groupthink` |
| Consensus *not required*, diverse outputs desired | [[roundtable-debate]] |
| Simple pass/fail validation | `agora` (default) |

See [multi-agent-debate-patterns](../guides/multi-agent-debate-patterns.md) for full selection matrix.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[codex-exec]], [[gemini-exec]], [[adversarial-review]], [[multi-model-verification]], [[roundtable-debate]]
- **See also**: [[R018]], [[R009]]

## Sources

- `.claude/skills/agora/SKILL.md` — skill definition (Anti-Groupthink Mode + Ontology Convergence added v0.108.0/#993)
