---
name: omcustom-loop
description: Prevent session idle during background agent work via SubagentStop prompt hook auto-continuation
scope: core
version: 1.0.0
user-invocable: true
---

# /omcustom:loop — Session Auto-Continuation

## Overview

Prevents session idle when background subagents complete by using a `SubagentStop` prompt hook that nudges the orchestrator to check for pending workflow steps.

## How It Works

1. When a background subagent completes, Claude Code fires the `SubagentStop` event
2. The prompt hook injects a message asking the orchestrator to check for pending steps
3. If pending steps exist, the orchestrator proceeds automatically
4. If no pending steps, it reports results and waits for user input

## Safety Limits

- **3 consecutive auto-continues max**: After 3 automatic progressions without user interaction, the system pauses and asks the user before proceeding
- **stuck-detector integration**: If the same action repeats 3+ times, stuck-detector intervenes
- **cost-cap-advisor**: Cost monitoring continues during auto-continuation

## Configuration

The hook is configured in `.claude/hooks/hooks.json` under `SubagentStop`. It works alongside the existing `task-outcome-recorder.sh` command hook.

## Limitations

- **Platform constraint**: Claude Code's turn-based model means the prompt hook only fires when a subagent completes — it cannot wake the model from true idle state
- **Foreground agents preferred**: For guaranteed continuation, use foreground parallel agents (R009) instead of background agents
- **PoC status**: This is an experimental feature. If the prompt hook doesn't reliably trigger in all scenarios, fall back to foreground agent patterns

## Usage

```bash
/omcustom:loop          # Show current auto-continuation status
/omcustom:loop status   # Same as above
```

The feature is active by default via hooks.json. No explicit activation needed.
