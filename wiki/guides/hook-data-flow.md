---
title: "Hook Data Flow Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/hook-data-flow/README.md
related:
  - [[mgr-sauron]]
---

# Hook Data Flow Guide

Reference documentation for the stall detection pipeline that detects stalled parallel agents and emits R009 Adaptive Parallel Splitting advisories.

## Overview

Documents the three-script pipeline introduced in v0.78.0: `agent-start-recorder.sh` (SubagentStart), `task-outcome-recorder.sh` (SubagentStop first), and `stall-detection-advisor.sh` (SubagentStop second). The pipeline uses `/tmp/.claude-agent-*` files keyed by `$PPID` to track agent spawn times, durations, and compute stall ratios for R009 advisory output.

## Key Topics

- Three-script pipeline: SubagentStart → SubagentStop (2 handlers in order)
- Data flow through `/tmp/.claude-agent-starts-$PPID` and `/tmp/.claude-agent-durations-$PPID`
- Stall detection logic: `avg_duration * 2` threshold against still-running agents
- Advisory output format to stderr (R021 advisory-only, never blocks)
- Hook ordering criticality in `hooks.json` array
- Integration with R009 Adaptive Parallel Splitting rule

## Relationships

- **Used by agents**: [[mgr-sauron]]
- **Related skills**: (referenced via R009 rule)
- **See also**: [[claude-code]], [[skill-bundle-design]]

## Sources

- `guides/hook-data-flow/README.md` — pipeline architecture, data flow diagram, stall detection logic
