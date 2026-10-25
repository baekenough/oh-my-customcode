---
name: omcustom-loop
description: SubagentStop advisory hooks during background agent work (outcome recording, consecutive-completion advisory; no orchestrator-workflow continuation)
scope: core
version: 1.0.0
user-invocable: true
---

# /omcustom-loop — SubagentStop Advisory Hooks

## Overview

When background subagents complete, `SubagentStop` command hooks record outcomes, count consecutive completions, and emit advisories; none of them continues the orchestrator's workflow. History: the "check pending steps" instruction was dropped from the prompt hook in v1.1.32 (commit 1dd0abef), and the remaining failure-gate prompt hook was replaced by an advisory command hook in d393db06 (#1631).

## How It Works

1. When a background subagent completes, Claude Code fires the `SubagentStop` event
2. The command hooks run: `task-outcome-recorder.sh` (records an outcome entry, but SubagentStop exposes no failure signal, so entries are always outcome=success; script comment lines 30-34), `stall-detection-advisor.sh` (stderr advisory on stalled parallel agents; stderr on exit 0 is visible to humans in transcript/debug, not fed to the model), `auto-continue-guard.sh` (counts consecutive completions), `r007-r008-drift-advisor.sh` (R007/R008 drift advisory), `subagent-failure-advisor.sh` (reads `.tool_output.is_error`, which is absent from the SubagentStop payload, so its warning can never trigger on this path until #1656 G (closed unfixed; tracked in #1775); script comment lines 30-34 of `task-outcome-recorder.sh` and line 22 of the advisor)
3. None of them continues the orchestrator's workflow; the orchestrator decides the next workflow step itself from the returned results. Exception: when `r007-r008-drift-advisor.sh` emits an advisory on SubagentStop, CC delivers the `additionalContext` to the stopping subagent, which continues its turn to respond (CHANGELOG 2.1.163).
4. If no steps remain, it reports results and waits for user input

## Consecutive-Completion Advisory

- **Consecutive-completion counter**: `auto-continue-guard.sh` counts SubagentStop events (counter resets after 60s idle); from the 4th completion onward within the window (count >= 4) it prints a stderr line "limit (3) reached. Pausing." (human-visible only, not a model-visible signal; among these five SubagentStop hooks only `r007-r008-drift-advisor.sh` uses `additionalContext`) and has no exit-2 path and its stdout carries no `decision` field, so it never blocks
- **stuck-detector integration**: If the same action repeats 3+ times, the independent PostToolUse stuck-detector hook intervenes
- **cost-cap-advisor**: Cost monitoring is independent of these hooks

## Configuration

The hooks are configured in `.claude/hooks/hooks.json` under `SubagentStop`. All five hooks are `type: command` and advisory (none has an exit-2 path or emits a `decision`/`continue` field outside comments, so they never block; grep of the five scripts for `exit 2`, `"decision"`, `decision:`, `"continue"` hit only comments in `r007-r008-drift-advisor.sh`).

## Limitations

- **Platform constraint**: Claude Code's turn-based model means these SubagentStop command hooks only fire when a subagent completes — none of them wakes the model from true idle state (no `asyncRewake` is configured: `grep -c asyncRewake` = 0 in both `.claude/hooks/hooks.json` and `.claude/settings.json`), and none of them continues the orchestrator's workflow
- **Foreground agents preferred**: These hooks do not guarantee continuation; use foreground parallel agents (R009) instead of background agents
- **PoC status**: This is an experimental feature. These hooks only record and advise; prefer foreground agent patterns when you need deterministic follow-up

## Usage

```bash
/omcustom-loop          # Skill entry point (no status command exists; the consecutive-completion counter lives in `/tmp/.claude-loop-count-${PPID}`)
```

The hooks are active by default: `.claude/hooks/hooks.json` is the source, and Claude Code loads the generated `.claude/settings.json` in this repo (R021); installed projects get the wiring merged into `.claude/settings.local.json` when the hooks component is installed (`src/core/installer.ts` returns early if `hooks.json` is absent). No explicit activation needed.
