---
title: roundtable-debate
type: skill
updated: 2026-04-25
sources:
  - .claude/skills/roundtable-debate/SKILL.md
related:
  - [[agora]]
  - [[adversarial-review]]
  - [[evaluator-optimizer]]
  - [[R009]]
  - [[R018]]
---

# roundtable-debate

Multi-agent structured debate with anti-groupthink mechanisms — divergence preservation over consensus. Complements [[agora]] (convergence-focused).

## Overview

Designed for situations where diverse perspectives matter more than a single answer. Runs 4–5 persona agents through a 2-round hard-capped debate. Produces three outputs: shared consensus (if any), preserved minority opinions, and Devil's Advocate final dissent. Uses Agent Teams (R018) and artifact channel protocol (R006) for inter-phase handoff.

## Key Details

- **Scope**: core
- **Context**: fork
- **Version**: 1.0.0
- **Source**: cc-roundtable pattern (github.com/gaebalai/cc-roundtable)

## Anti-Groupthink Mechanisms

| Problem | Mechanism |
|---------|-----------|
| Anchoring | Round 0 — independent parallel analysis before any peer exposure |
| Groupthink | Devil's Advocate persona (mandatory dissenter slot) |
| Degeneration of Thought | 2-round hard cap (research-based: diversity drops sharply after round 3) |
| Minority opinion suppression | Explicit 3-justification requirement to reject minority views |

## Workflow Phases

1. **Phase 0** — Independent parallel analysis (4–5 personas, no peer visibility)
2. **Phase 1** — Round 1 discussion via SendMessage; minority opinions tracked separately
3. **Phase 2** — Round 2 convergence attempt; terminates regardless of consensus
4. **Phase 3** — Orchestrator synthesizes 3-part report; unresolved areas marked "합의 없음 — 사용자 결정 필요"

## Default Personas

| Persona | Role |
|---------|------|
| architect | Structural consistency, R006 separation of concerns |
| critic-devil | Devil's Advocate — always holds opposing position |
| implementer | Feasibility, cost |
| user-advocate | UX, developer experience |

## When to Use

| Situation | Recommended skill |
|-----------|------------------|
| Need unanimous consensus | [[agora]] |
| Need diverse risk discovery | `roundtable-debate` |
| Single-verdict validation | [[agora]] |
| Intentional divergence + minority protection | `roundtable-debate` |

## Relationships

- **Complements**: [[agora]], [[adversarial-review]], [[evaluator-optimizer]]
- **Requires**: R018 (Agent Teams when enabled), R009 (parallel Phase 0), R006 (artifact channel)
- **See also**: [multi-agent-debate-patterns](../guides/multi-agent-debate-patterns.md)

## Sources

- `.claude/skills/roundtable-debate/SKILL.md` — skill definition
- `guides/multi-agent-debate-patterns/README.md` — pattern theory and selection matrix
