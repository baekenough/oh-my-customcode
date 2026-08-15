---
title: agora-runner
type: agent
updated: 2026-08-15
sources:
  - .claude/agents/agora-runner.md
related:
  - [[agora]]
  - [[arch-documenter]]
  - [[r009]]
  - [[r010]]
  - [[r020]]
---

# agora-runner

Executes exactly one [[agora]] consensus round via the skill scripts and returns only a verdict summary — never reviewer text, vendor attribution, or sealed paths.

## Overview

`agora-runner` is the file-writing half of the `agora` skill's R010 delegation split: since the orchestrator cannot write files directly, round execution (`--round`, `--report`) is delegated here one round at a time. The agent never runs `--gate` (a pure-output command with no field in the return contract to carry it) — that stays with the orchestrator, which also owns all user interaction.

Per-invocation scope is deliberately narrow: **one delegation = one round**. Multiple rounds are never bundled into a single call — Phase/round boundaries are exactly where mid-step termination has recurred in this project ([[r020]] "위임 경계를 Phase 개수로 설계"), so each round is dispatched, verified, and re-dispatched independently.

## Key Details

- **Model**: claude-sonnet-5
- **Tools**: Bash, Read, Write, Glob
- **Skills**: agora
- **Scope per call**: exactly one round (`--round <N>`), then `--decide-stop`, then conditionally `--report`

## Execution Procedure

1. `bash agora.sh --round <N> --session-dir <dir>` (adds `--extra-agenda <json-array>` if the orchestrator forwarded an `e`-gate response; a non-array value is rejected with exit 64)
2. `bash agora.sh --decide-stop < state.json` to determine the stop code, returned as `stop_code`
3. If stopping: `bash agora.sh --report --session-dir <dir>` to generate `report.md`

`--round` does not itself check `.stop` or `max_rounds` — the agent performs that decision explicitly via step 2 rather than relying on the script to gate it.

### Exit Code Handling

- Exit `3` (2+ reviewers missing) → report round aborted, stop
- Exit `4` (judge rotation exhausted) → report session aborted, stop

## Return Contract

Only these fields are returned — never reviewer raw text, vendor identifiers, or `SEALED/` path strings:

| Field | Source |
|-------|--------|
| `round` | `verdict/round-N.json` `.round` |
| `consensus` | `.consensus` |
| `verdict` | `.verdict` |
| `resolved` | `.resolved` |
| `unresolved` | `.unresolved` |
| `agenda` | `.agenda` |
| `new_findings` | `.new_findings` |
| `stop_code` | `agora.sh --decide-stop` result |

## Relationships

- **Executes rounds for**: [[agora]] (skill defining the pipeline and trust boundary)
- **Contrast**: [[arch-documenter]] (also file-writing/Bash-restricted specialist, but for docs not consensus rounds)
- **Governed by**: [[r009]] (single-round dispatch unit), [[r010]] (delegated file-writing half of orchestrator/agent split), [[r020]] (one-goal-per-delegation, mid-step termination avoidance)

## Sources

- `.claude/agents/agora-runner.md` — agent definition
