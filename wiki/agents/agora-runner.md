---
title: agora-runner
type: agent
updated: 2026-08-17
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

Executes exactly one [[agora]] session step via the skill scripts and returns only a verdict summary — never reviewer text, vendor attribution, or sealed paths.

## Overview

`agora-runner` is the file-writing half of the `agora` skill's R010 delegation split. Since the orchestrator cannot write files directly, **all four file-writing entry points** — `--start`, `--round`, `--set-stop`, `--report` — are delegated here. The agent never runs `--gate`: it is a pure-output command with no field in the return contract to carry it, and the runner does not interact with the user.

Per-invocation scope is deliberately narrow: **one delegation = one step**. Steps are never bundled — Phase/round boundaries are exactly where mid-step termination has recurred in this project ([[r020]] "위임 경계를 Phase 개수로 설계"), so each step is dispatched, verified, and re-dispatched independently.

## Key Details

- **Model**: claude-sonnet-5
- **Tools**: Bash, Read, Write, Glob
- **Skills**: agora
- **Scope per call**: one of — session start, one round, or session finish

## Delegation Types

| Type | Command(s) | Single goal |
|------|-----------|-------------|
| Session start | `--start` (runs through round 1 in gated mode) | create session + round 1 |
| Round | `--round <N>` | exactly one round |
| Session finish | `--set-stop <CODE>` → `--report` | record stop reason + generate report |

### Session Start

`--start` puts **only the session directory absolute path on stdout** — capture with `dir=$(bash agora.sh --start ...)`. The gate block goes to **stderr**, so it cannot be carried in the return contract; the orchestrator re-renders it via `--gate --session-dir <dir> --round 1`, and the runner does not transcribe it. `--auto` is added only on explicit orchestrator instruction (worst case ~2h, ~600k tokens).

If round 1 hits a stop condition, `--start` itself records `.stop` and generates `report.md` without rendering a gate — detected by reading `.stop` in `state.json`. In that case `--set-stop` and `--report` must NOT be run again.

### Round

`--round` checks neither `.stop` nor `max_rounds` and does not call `--decide-stop`, so the runner determines the stop code explicitly: run the round, then `bash agora.sh --decide-stop < <dir>/state.json`, then **return**. Neither `--set-stop` nor `--report` runs in a round delegation — the stop decision belongs to the orchestrator holding the user's gate response. `--extra-agenda` is added only when an `e` gate response was forwarded, and must be a JSON array (otherwise exit 64).

### Session Finish

`--set-stop` runs **before** `--report` and is never skipped: from round 2 onward it is the only writer of `.stop`, so omitting it yields `종료 사유: UNKNOWN` in the report. `<CODE>` is whatever the orchestrator specified, else the last `--decide-stop` result — `CONSENSUS` / `STALLED` / `MAX_ROUNDS` from `--decide-stop`, `USER` when the user chose `s` at the gate; `CONTINUE` is rejected with exit 64. If `--set-stop` exits non-zero, `--report` is not run and the failure is reported.

## Exit Code Handling

Every command's exit code is checked. **No code justifies re-running a round on the agent's own judgment** — vendors get billed again.

| Code | Meaning | Action |
|------|---------|--------|
| `1` | Fingerprint detected; nothing written to `SEALED/mapping/` or `anon/` | report, stop |
| `3` | Fewer than 2 valid reviewers (CLI-missing or schema-invalid stage) | report, stop |
| `4` | All 3 judge rotation slots failed | report, stop |
| `64` | Call error (option / flag / `--extra-agenda` array / `--set-stop` code); vendors were not called | at most one corrective retry if the call shape is plainly wrong |
| `65` | Prior-round sealed data present but unparseable | report, stop |
| `66` | Session directory or anonymous bundle not found | report, stop |
| `68` | Config error — `verdict-schema.json` unreadable; a retry fails identically | report, stop |
| `73` | Round ran and billed, but `state.json`/`report.md` write failed | **do not consume artifacts, do not re-run**; report the stderr diagnostic |

Diagnosing a `1` or `65` abort by reading files under `SEALED/` is prohibited — only the stderr diagnostic line is reported.

## Return Contract

Only these fields; fields not applicable to the delegation type are omitted.

| Field | Source |
|-------|--------|
| `session_dir` | `--start` stdout (session-start delegation only) |
| `round` | `verdict/round-N.json` `.round` |
| `consensus` / `verdict` | `.consensus` / `.verdict` |
| `resolved` / `unresolved` | `.resolved` (id + resolution) / `.unresolved` (id + severity + positions) |
| `agenda` / `new_findings` | `.agenda` / `.new_findings` |
| `stop_code` | `agora.sh --decide-stop` result |
| `exit_code` | executed command's exit code |
| `stop_recorded` / `report_path` | session-finish delegation only |

## Prohibitions

No reads under `SEALED/`; no reviewer raw text, vendor identifiers, or `SEALED/` path strings in the return. The `A`/`B`/`C` labels in `anon/round-N.json` are re-shuffled every round, so they are **never** interpreted as a vendor or compared across rounds. The agent asks the user nothing — gate display is the orchestrator's alone.

## Relationships

- **Executes steps for**: [[agora]] (skill defining the pipeline and trust boundary)
- **Contrast**: [[arch-documenter]] (also a file-writing specialist with a restricted tool set, but for docs rather than consensus rounds)
- **Governed by**: [[r009]] (single-step dispatch unit), [[r010]] (delegated file-writing half of the orchestrator/agent split), [[r020]] (one goal per delegation, mid-step termination avoidance)

## Sources

- `.claude/agents/agora-runner.md` — agent definition
