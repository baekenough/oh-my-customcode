---
title: Omcustom Loop
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/omcustom-loop/SKILL.md
related:
  - [[pipeline]]
  - [[dag-orchestration]]
  - [[fsd]]
  - [[r009]]
  - [[r021]]
---

# Omcustom Loop

Prevent session idle during background subagent work by auto-continuing the orchestrator through a `SubagentStop` prompt hook.

## Overview

`omcustom-loop` addresses a Claude Code platform constraint: the turn-based model goes idle once a background subagent finishes, unless something nudges it forward. The skill wires a `SubagentStop` prompt hook (configured in `.claude/hooks/hooks.json`, alongside the existing `task-outcome-recorder.sh` command hook) that fires when a background subagent completes. The hook injects a message asking the orchestrator to check for pending workflow steps — if any exist, the orchestrator proceeds automatically; otherwise it reports results and waits for user input. This makes long-running multi-step workflows (e.g. [[pipeline]], [[dag-orchestration]], [[fsd]]) resilient to background-agent completion gaps without requiring the user to manually re-prompt.

The skill is explicitly marked **PoC status** — an experimental mechanism, not a guaranteed continuation contract. Its own docs recommend falling back to foreground parallel agents ([[r009]]) when guaranteed continuation is required, since the prompt hook can only fire on subagent completion and cannot wake the model from true idle state.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/omcustom-loop` (also `/omcustom-loop status`) — shows current auto-continuation status; the feature itself is active by default via hooks.json, no explicit activation needed
- **Safety limits**: max 3 consecutive auto-continues before pausing for user input; [[r021]]'s stuck-detector intervenes if the same action repeats 3+ times; cost-cap-advisor continues monitoring cost during auto-continuation

## Relationships

- **Depends on**: `SubagentStop` hook event (`.claude/hooks/hooks.json`)
- **Related skills**: [[pipeline]], [[dag-orchestration]], [[fsd]] (session continuity for long-running loops)
- **See also**: [[r009]] (foreground-agent fallback), [[r021]] (stuck-detector/cost-cap-advisor enforcement)

## Sources

- `.claude/skills/omcustom-loop/SKILL.md` — skill definition
