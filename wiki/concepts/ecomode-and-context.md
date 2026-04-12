---
title: Ecomode and Context Management
type: concept
updated: 2026-04-12
sources:
  - .claude/rules/SHOULD-ecomode.md
  - .claude/rules/MAY-optimization.md
  - CLAUDE.md
related:
  - [[memory-workflow]]
  - [[wiki/rules/r013]]
  - [[wiki/rules/r005]]
  - [[development-workflow]]
---

# Ecomode and Context Management

Context management in oh-my-customcode operates on two axes: **output compression** (ecomode) and **input pruning** (context budget management). Together they maintain token efficiency across long sessions and large parallel operations without losing critical information.

## Overview

Every Claude Code session has a finite context window. oh-my-customcode manages this through:
1. **Ecomode** — compressed output format for agents in batch/parallel operations
2. **Input context pruning** — active removal of irrelevant retrieved content
3. **Context budget management** — task-type-aware activation thresholds
4. **HTML comment optimization** — hiding metadata from model context (R005)

## Ecomode (R013)

### Auto-Activation Triggers

Ecomode activates automatically when any of these conditions are met:
- 4+ parallel tasks running simultaneously
- Batch operations (processing multiple files/items)
- Context usage reaches the task-type threshold
- Explicit user command: "ecomode on"

### Output Format Change

**Normal mode**: Full agent header + step-by-step analysis + detailed results.

**Ecomode**: `[agent-name] ✓/✗/⚠ {one-sentence summary} — {key finding}`

Aggregation format:
```
[Batch Complete] {n}/{total}
├── agent-1: ✓ {summary}
├── agent-2: ✗ {failure reason}
└── agent-3: ⚠ {warning}
```

Compressions applied: file lists → count only (< 5 files shown individually), error traces → first/last 3 lines, code references → `path:line` only.

### Deactivation

- "ecomode off"
- "verbose mode"
- "show full details"

## Context Budget Management

Task type determines when ecomode activates, not a single global threshold:

| Task Type | Context Trigger | Rationale |
|-----------|----------------|-----------|
| Research (`/research`, multi-team) | 40% | High consumption from parallel team results |
| Implementation (code generation) | 50% | Moderate context for code + test output |
| Review (code review, audit) | 60% | Moderate context for diff analysis |
| Management (git, deploy, CI) | 70% | Lower context needs |
| General (default) | 80% | Standard threshold |

The `context-budget-advisor.sh` hook monitors usage and emits warnings as thresholds approach:
```
[Context Budget] Task: research | Threshold: 40% | Current: 38%
[Context Budget] ⚠ Approaching budget limit — consider /compact or ecomode
```

## Input Context Pruning

Ecomode manages output; pruning manages the input side. When retrieved chunks accumulate (from multiple Grep/Read operations), pruning maintains relevance:

| Strategy | When Applied | Behavior |
|----------|-------------|----------|
| **Retain** | Directly relevant code/docs | Keep as-is |
| **Summarize** | Background context, prior hop results | Replace with 1–2 line summary |
| **Drop** | Search noise, duplicates, already-reflected info | Remove entirely |

### Pruning Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Search overflow | Retrieved chunks > 10 | Retain top-K by relevance |
| Context pressure | Usage > 50% | Summarize oldest/lowest-relevance chunks |
| Multi-hop intermediate | Between retrieval hops | Replace previous hop raw results with summary |

**Rule**: Generate summary BEFORE dropping original content. Pruning is irreversible.

Track decisions: `[Pruned] {N} chunks → {M} retained, {K} summarized, {J} dropped`

## HTML Comment Optimization (R005)

CLAUDE.md and rules/*.md files are auto-injected into context. HTML comments in these files are hidden from the model during auto-injection but visible via the Read tool.

Use cases:
- Metadata tags: `<!-- agents: 47, skills: 103 -->`
- Validation checksums: `<!-- validate-docs: hash=abc123 -->`
- Conditional context: `<!-- detailed-architecture: see guides/architecture/ -->`

This allows metadata to live alongside content without inflating the model's context window.

## Memory vs Context Pruning

A common confusion worth clarifying:

| Concept | Rule | Scope | Mechanism |
|---------|------|-------|-----------|
| **Context pruning** (R013) | Intra-session | Within a task | Drop/summarize retrieved chunks |
| **Memory pruning** (R011) | Cross-session | Across tasks | MEMORY.md maintenance under 200 lines |

Context pruning happens during retrieval in a single task. Memory pruning happens at session end when [[wiki/agents/sys-memory-keeper]] condenses session learnings into MEMORY.md.

## Relationships

- **Depends on**: [[wiki/rules/r013]] (ecomode rules), [[wiki/rules/r005]] (HTML comment optimization)
- **Used by**: [[development-workflow]] (50% threshold), [[release-workflow]] (research 40% threshold), [[memory-workflow]] (memory vs context distinction)
- **See also**: [[memory-workflow]], [[wiki/rules/r011]]

## Sources

- `.claude/rules/SHOULD-ecomode.md` — R013 full activation triggers, pruning strategies, budget management
- `.claude/rules/MAY-optimization.md` — R005 HTML comment optimization
