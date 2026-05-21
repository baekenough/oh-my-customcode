---
title: "Agent Teams Troubleshooting Guide"
type: guide
updated: "2026-05-21"
sources:
  - guides/agent-teams/troubleshooting.md
related:
  - rules/r018.md
  - concepts/ecomode-and-context.md
  - workflows/development-workflow.md
---

# Agent Teams Troubleshooting Guide

Operational troubleshooting guide for Agent Teams — covers graceful shutdown failures, member silence, and residual resource cleanup. Based on field reports from [#1206](https://github.com/baekenough/oh-my-customcode/issues/1206) and [#1210](https://github.com/baekenough/oh-my-customcode/issues/1210), added in v0.150.0.

## Core Problems Addressed

| Problem | Root Cause |
|---------|-----------|
| Graceful shutdown deadlock | Member stuck in polling loop; `isActive` flag not cleared |
| Member silence (TaskUpdate gap) | R018 TaskUpdate Discipline violated |
| Residual directories after TeamDelete | CC platform does not always auto-clean |

## Graceful Shutdown Failure — 5-Stage Escalation

1. Send `shutdown_request` once via `SendMessage`, wait 30s
2. Resend `shutdown_request`, wait another 30s
3. Force kill via `tmux -L claude-swarm-$$ kill-pane -t <pane-id>` (last resort)
4. Manually set `isActive = false` in `~/.claude/teams/<team-id>/members.json` using `jq`
5. Retry `TeamDelete` — succeeds once all members show `isActive: false`

The `~/.claude/teams/` path is CC-version-dependent; verify against current release notes.

## Member Silence (TaskUpdate Discipline)

R018 requires explicit `TaskUpdate` calls at four checkpoints:

| Checkpoint | Required Call |
|-----------|--------------|
| Task start | `TaskUpdate(taskId, status: "in_progress")` |
| Every 30s checkpoint | `TaskUpdate(taskId, description: "<progress>")` |
| Completion | `TaskUpdate(taskId, status: "completed")` |
| Blocked | `TaskUpdate(taskId, description: "<reason>")` + `SendMessage` |

Omitting these causes coordinators to misread member state as dead and attempt re-spawn, producing duplicate work.

## CC Upstream Limitations (v2.1.146)

No `force` option on `TeamDelete`, no member-kill API, no configurable graceful timeout. Tracked in [[guides/claude-code-tracking]]. When CC adds a formal force-shutdown API, stages 3–4 above become obsolete.

## Cross-References

- [[rules/r018]] — Agent Teams rules including Member TaskUpdate Discipline
- [[concepts/ecomode-and-context]] — context budget under parallel team execution
- [[workflows/development-workflow]] — where Agent Teams fits in the full dev pipeline
- Issue [#1210](https://github.com/baekenough/oh-my-customcode/issues/1210) — source field report (#1206 item 2 split)
- `guides/agent-teams/troubleshooting.md` — full source with shell commands
- `guides/claude-code-tracking.md` — CC upstream feature tracking
