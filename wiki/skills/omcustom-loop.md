---
title: Omcustom Loop
type: skill
updated: 2026-10-26
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

SubagentStop advisory hooks that run during background subagent work: outcome recording and a consecutive-completion advisory, with no orchestrator-workflow continuation.

## Overview

`omcustom-loop` documents the `SubagentStop` hooks configured in `.claude/hooks/hooks.json`. When background subagents complete, four `type: command` hooks run: `task-outcome-recorder.sh` (records an outcome entry, but SubagentStop exposes no failure signal, so entries are always outcome=success), `stall-detection-advisor.sh` (stderr advisory on stalled parallel agents; stderr on exit 0 is visible to humans in transcript/debug, not fed to the model), `auto-continue-guard.sh` (counts consecutive completions), and `r007-r008-drift-advisor.sh` (R007/R008 drift advisory). Failure advisories for Agent/Task calls come from `PostToolUseFailure` (`subagent-failure-advisor.sh`) instead, not from SubagentStop (the hook moved in v2.0.8). Per the official hooks doc, SubagentStop hooks support `hookSpecificOutput.additionalContext` for non-error feedback that keeps the subagent running, and context for the parent session after a subagent returns belongs in a `PostToolUse` hook on the `Agent` tool.

None of them continues the orchestrator's workflow; the orchestrator decides the next workflow step itself from the returned results. Exception: when `r007-r008-drift-advisor.sh` emits an advisory on SubagentStop, Claude Code delivers the `additionalContext` to the stopping subagent, which continues its own turn to respond (CHANGELOG 2.1.163); that continuation is not a block. History: the "check pending steps" instruction was dropped from the prompt hook in v1.1.32 (commit 1dd0abef), and the remaining failure-gate prompt hook was replaced by an advisory command hook in d393db06 (#1631).

The skill is marked **PoC status**: the hooks only record and advise. Claude Code's turn-based model means these SubagentStop command hooks only fire when a subagent completes — none of them wakes the model from true idle state (no `asyncRewake` is configured in `.claude/hooks/hooks.json` or `.claude/settings.json`), and none of them continues the orchestrator's workflow — so foreground parallel agents ([[r009]]) are preferred when deterministic follow-up is needed. Long-running workflows ([[pipeline]], [[dag-orchestration]], [[fsd]]) are driven by the orchestrator itself.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/omcustom-loop` is a skill entry point; no status command exists, and the consecutive-completion counter lives in `/tmp/.claude-loop-count-${PPID}`
- **Activation**: active by default — `.claude/hooks/hooks.json` is the source and Claude Code loads the generated `.claude/settings.json` in this repo ([[r021]]); installed projects get the wiring merged into `.claude/settings.local.json` when the hooks component is installed. No explicit activation needed
- **Consecutive-completion advisory**: `auto-continue-guard.sh` counts SubagentStop events (counter resets after more than 60 s idle since the last completion, so the window chains); from the 4th completion within the window (count >= 4) it prints a stderr line "[ConsecutiveCompletions] ADVISORY: 4+ consecutive subagent completions, each within 60s of the previous (advisory only; nothing is paused)." (human-visible only, not a model-visible signal) and contains no `exit 2` statement (its only explicit exit is `exit 0`); it echoes the input payload to stdout (three of the four hooks — `task-outcome-recorder.sh`, `stall-detection-advisor.sh`, `auto-continue-guard.sh` — echo the payload), and the CC 2.1.310 SubagentStop payload has no top-level `decision`/`continue` key (CC 2.1.310 binary SubagentStop payload builder, inspected during the v2.0.6/v2.0.7 reviews), so it does not block. Among these four SubagentStop hooks only `r007-r008-drift-advisor.sh` uses `additionalContext`
- **Independent monitors**: the PostToolUse stuck-detector intervenes if the same action repeats 3+ times, and cost-cap-advisor monitoring is independent of these hooks

## Relationships

- **Depends on**: `SubagentStop` hook event (`.claude/hooks/hooks.json`)
- **Related skills**: [[pipeline]], [[dag-orchestration]], [[fsd]]
- **See also**: [[r009]] (foreground-agent fallback), [[r021]] (stuck-detector/cost-cap-advisor enforcement)

## Sources

- `.claude/skills/omcustom-loop/SKILL.md` — skill definition
- Content-drift resync 2026-10-25: replaced the "session auto-continuation via SubagentStop prompt hook" framing with the source's advisory-only command-hook description (five hooks, no orchestrator-workflow continuation, drift-advisor `additionalContext` exception, consecutive-completion advisory instead of an auto-continue limit, no `status` subcommand).
- Content-drift resync 2026-10-25 (final corrections): narrowed idle-wake and guard-blocking statements to "these SubagentStop command hooks" (no `asyncRewake`; guard has no exit-2 path and no `decision` field; none continues the orchestrator's workflow).
- Content-drift resync 2026-10-26 (v2.0.7): the no-`decision`/`continue` evidence note now cites the CC 2.1.310 binary SubagentStop payload builder (inspected during the v2.0.6/v2.0.7 reviews) instead of "(#1880)"; the source's grep-pattern list (now including `continue:`, 0 hits) and content anchors are not restated on this page.
- Content-drift resync 2026-10-26 (v2.0.8): SubagentStop now runs four command hooks (`subagent-failure-advisor.sh` moved to PostToolUseFailure for Agent/Task); the consecutive-completion advisory wording follows the script ("4+ consecutive subagent completions, each within 60s of the previous", window chains); three of four hooks echo the payload; added the official hooks-doc `additionalContext` citations.
