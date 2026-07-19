---
title: Structured Dev Cycle
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/structured-dev-cycle/SKILL.md
related:
  - [[deep-plan]]
  - [[multi-model-verification]]
  - [[reasoning-sandwich]]
  - [[r018]]
  - [[r009]]
  - [[r010]]
---

# Structured Dev Cycle

6-stage structured development cycle with stage-based tool restrictions, inspired by the Pi Coding Agent Workflow Extension. The core insight: blocking Write/Edit during planning phases forces analysis before code changes, rather than relying on instruction-based discipline alone.

## Overview

Enforces a disciplined 6-stage cycle: Plan (Read/Glob/Grep/WebSearch/WebFetch only) → Verify Plan (Read-only, different perspective) → Implement (all tools) → Verify Implementation (tests only, no Write/Edit) → Compound (integration testing, tests only) → Done (Read-only summary). Model recommendation follows the [[reasoning-sandwich]] pattern: opus for Plan/Verify Plan, sonnet for Implement/Verify Implementation/Compound, haiku for Done — advisory, the orchestrator may override per task complexity.

Stage transitions are tracked via a PID-scoped marker file, `/tmp/.claude-dev-stage-$PPID`, so concurrent Claude Code sessions do not collide. A PreToolUse hook (`stage-blocker.sh`, registered in `.claude/hooks/hooks.json`) reads the marker and blocks Write/Edit outside the `implement` stage — a safety net beyond prompt-based compliance. Because `/tmp/` is world-writable, the marker's PID suffix isolates sessions but does not restrict filesystem permissions, so sensitive data must not be stored in it.

The skill previously offered a Codex-Exec Hybrid option in Stage 3 (auto-delegating scaffolding to `codex-exec`); this was retired in v0.159.0 alongside the broader codex-exec/gemini-exec/agora deprecation in favor of `codex-plugin-cc`. Stage 3 is now Claude-experts-only. For complex tasks, [[r018]] Agent Teams is preferred when available — Plan/Verify use architect and reviewer agents, Implement uses a domain expert, Compound uses a QA agent; Agent Teams is mandatory when 3+ agents or review→fix cycles are involved. Cycle depth scales with task size: skip for <3 files, abbreviated (stages 1/3/4/6) for 3-10 files, full 6-stage for 10+ files or security-critical code. Agent tool calls made during this skill's execution must pass `mode: "bypassPermissions"` (R010).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Version**: 1.0.0
- **Stage marker**: `/tmp/.claude-dev-stage-$PPID` (session-scoped by parent PID)

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[deep-plan]], [[multi-model-verification]], [[reasoning-sandwich]]
- **See also**: [[r018]] (Agent Teams), [[r009]] (parallel execution), [[r010]] (bypassPermissions delegation)

## Sources

- `.claude/skills/structured-dev-cycle/SKILL.md` — skill definition
