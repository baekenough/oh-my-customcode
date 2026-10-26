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
2. The command hooks run: `task-outcome-recorder.sh` (records an outcome entry, but SubagentStop exposes no failure signal, so entries are always outcome=success (hooks doc lists SubagentStop input fields as `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons` plus common fields; measured payload keys: https://github.com/baekenough/oh-my-customcode/issues/1775#issuecomment-6404861043); see the "Outcome caveat" comment in the script), `stall-detection-advisor.sh` (stderr advisory on stalled parallel agents; stderr on exit 0 is not fed to the model (the doc says only: "To read it yourself … enable debug logging"); official hooks doc https://code.claude.com/docs/en/hooks.md: "Claude never sees stderr from a hook that exits 0."), `auto-continue-guard.sh` (counts consecutive completions), `r007-r008-drift-advisor.sh` (R007/R008 drift advisory); failure advisories for Agent/Task calls come from `PostToolUseFailure` (`subagent-failure-advisor.sh`) instead, not from SubagentStop
3. None of them continues the orchestrator's workflow; the orchestrator decides the next workflow step itself from the returned results. Exception: when `r007-r008-drift-advisor.sh` emits an advisory on SubagentStop, CC delivers the `additionalContext` to the stopping subagent, which continues its turn to respond (CHANGELOG 2.1.163); hooks doc: SubagentStop hooks support `hookSpecificOutput.additionalContext` "for non-error feedback that keeps the subagent running", and "To inject context into the parent session after a subagent returns, use a [`PostToolUse`](#posttooluse) hook on the `Agent` tool instead."
4. If no steps remain, it reports results and waits for user input

## Consecutive-Completion Advisory

- **Consecutive-completion counter**: `auto-continue-guard.sh` counts SubagentStop events (counter resets after more than 60 s idle since the last completion, so the window chains); from the 4th completion onward within the window (count >= 4) it prints a stderr line "[ConsecutiveCompletions] ADVISORY: 4+ consecutive subagent completions, each within 60s of the previous (advisory only; nothing is paused)." (human-visible only, not a model-visible signal; among these four SubagentStop hooks only `r007-r008-drift-advisor.sh` uses `additionalContext`) and its script contains no `exit 2` statement (its only explicit exit is `exit 0`); it echoes the input payload to stdout, and the CC 2.1.310 SubagentStop payload has no top-level `decision`/`continue` key (CC 2.1.310 binary SubagentStop payload builder, inspected during the v2.0.6/v2.0.7 reviews), so it does not block
- **stuck-detector integration**: If the same action repeats 3+ times, the independent PostToolUse stuck-detector hook intervenes
- **cost-cap-advisor**: Cost monitoring is independent of these hooks

## Configuration

The hooks are configured in `.claude/hooks/hooks.json` under `SubagentStop`. All four hooks are `type: command` and advisory (none contains an `exit 2` statement or emits a `decision`/`continue` field outside comments, so none blocks; the grep pattern covered `exit 2`, `"decision"`, `decision:`, `"continue"` and `continue:` and hit only comments in `r007-r008-drift-advisor.sh`; the `continue:` form added no hits. Three of the four hooks (`task-outcome-recorder.sh`, `stall-detection-advisor.sh`, `auto-continue-guard.sh`; measured by `git grep -n` of `printf '%s\n' "$input"` at task-outcome-recorder.sh:218, stall-detection-advisor.sh:31/:44/:124, auto-continue-guard.sh:32; `r007-r008-drift-advisor.sh` instead prints the `additionalContext` JSON on stdout, :456-:457; its advisory text also goes to stderr at :451, which the model does not see) echo the CC payload to stdout, which carries no top-level `decision`/`continue` key in CC 2.1.310. The drift advisor's `additionalContext` makes the stopping subagent continue its own turn; that continuation is not a block).

## Limitations

- **Platform constraint**: Claude Code's turn-based model means these SubagentStop command hooks only fire when a subagent completes — none of them wakes the model from true idle state (no `asyncRewake` is configured: `grep -c asyncRewake` = 0 in both `.claude/hooks/hooks.json` and `.claude/settings.json`), and none of them continues the orchestrator's workflow
- **Foreground agents preferred**: These hooks do not guarantee continuation; use foreground parallel agents (R009) instead of background agents
- **PoC status**: This is an experimental feature. These hooks only record and advise; prefer foreground agent patterns when you need deterministic follow-up

## Usage

```bash
/omcustom-loop          # Skill entry point (no status command exists; the consecutive-completion counter lives in /tmp/.claude-loop-count-${PPID})
```

The hooks are active by default: `.claude/hooks/hooks.json` is the source, and Claude Code loads the generated `.claude/settings.json` in this repo (R021); installed projects get the wiring merged into `.claude/settings.local.json` when the hooks component is installed (`src/core/installer.ts` returns early if `hooks.json` is absent). No explicit activation needed.
