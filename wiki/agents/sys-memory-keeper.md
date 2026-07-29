---
title: sys-memory-keeper
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/sys-memory-keeper.md
related:
  - [[sys-naggy]]
  - [[mgr-sauron]]
  - [[r011]]
  - [[r016]]
  - [[r006]]
  - [[r010]]
  - [[omcustom-feedback]]
---

# sys-memory-keeper

Session memory management specialist for saving/restoring context across compactions using native auto-memory (MEMORY.md), extracting behavioral patterns, maintaining the user model, and aggregating agent performance metrics.

## Overview

`sys-memory-keeper` runs at session end to ensure context survives compaction. Its workflow: (1) collect session summary (tasks, decisions, open items), (2) extract user behavior patterns with confidence levels into `## Behaviors` (new → `[confidence: low]`, re-observed → promote, contradicted → flag/demote), and (3) update native auto-memory MEMORY.md. It then runs three session-end sub-passes: **Confidence Decay Check** (parses `[confidence, verified: YYYY-MM-DD]` tags; 30+ days unverified demotes one level, 60+ demotes again, 90+ flags `[STALE]`; `[permanent]` entries are skipped), **Metrics Aggregation** (reads `/tmp/.claude-task-outcomes-${PPID}` JSONL, aggregates success rate/model distribution per `agent_type` into the `## Metrics` table, enforcing a 20-row budget), and **User Model Extraction** (skill-invocation counts → top-10 Skill Preferences, R016-style correction detection → Correction Patterns matched to rule IDs, file-extension access → Expertise Profile top-3 domains, explicit routing overrides → last 5, all written to a 30-line-max `## User Model` section).

Native auto-memory (MEMORY.md) is the single persistence backend. The claude-mem and agentmemory MCP servers were permanently removed (#1253), so there is no MCP save step — `sys-memory-keeper` handles all persistence through MEMORY.md. On write failure, the agent reports the error to the orchestrator rather than silently dropping the session's learnings (non-blocking per [[r011]]).

## Key Details

- **Model**: claude-sonnet-5
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: local
- **Effort**: medium
- **Max Turns**: 15
- **Limitations**: cannot modify source code, cannot execute tests

## Relationships

- **Depends on**: `.claude/agent-memory-local/sys-memory-keeper/MEMORY.md` (native auto-memory, `local` scope per [[r006]] Memory Scopes — git-untracked, unlike `project`-scope agents)
- **Used by**: Orchestrator (session-end signal, [[r010]] delegation), [[r011]] session-end workflow, [[omcustom-feedback]] (model-drafted retrospective at session end)
- **See also**: [[sys-naggy]] (task tracking), [[mgr-sauron]] (structural verification, distinct memory concern), [[r016]] (correction-pattern → rule-ID matching feeds R016's continuous-improvement loop)

## Sources

- `.claude/agents/sys-memory-keeper.md` — agent definition
