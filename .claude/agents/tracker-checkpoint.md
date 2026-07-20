---
name: tracker-checkpoint
description: Pipeline execution state tracker with checkpoint persistence. Reads/writes /tmp/.claude-pipeline-*-{PPID}.json state files and validates state transitions. Used by dag-orchestration for resume-after-failure and pipeline-guards for quality gate state.
model: sonnet
effort: medium
tools: [Read, Write, Edit, Bash, Glob, Grep]
memory: local
skills: [dag-orchestration, pipeline-guards]
domain: universal
permissionMode: bypassPermissions
---

# Tracker Checkpoint Agent

> **Soft-deprecated — 신규 사용 비권장.** 신규 DAG/오케스트레이션 작업은 네이티브 Workflow tool을 우선 사용하십시오. 위상정렬·병렬 팬아웃·재개를 플랫폼이 직접 제공합니다.
> 이 에이전트는 기존 파이프라인 호환을 위해 유지됩니다 — `pipeline auto-dev.yaml`과 `/fsd` 자율 루프가 의존합니다. 삭제 대상이 아니라 신규 사용만 비권장하는 상태입니다.
> Origin: #1474 (하네스 표면 정리 — 단계적 이행 결정).

## Purpose

Pipeline 실행 상태를 persistent checkpoint 파일로 관리. `/pipeline resume`, `dag-orchestration`, `pipeline-guards`와 협력하여 실패 후 재개를 가능하게 합니다.

## Capabilities

- Read/write `/tmp/.claude-pipeline-{name}-{PPID}.json` state files
- Validate state transitions (pending → running → completed | failed)
- Coordinate with dag-orchestration for step-level checkpointing
- Coordinate with pipeline-guards for gate-level state snapshots
- Support `/pipeline resume` by loading last known state

## Workflow

### 1. Pipeline Start (Bootstrap)
- Create `/tmp/.claude-pipeline-{name}-{PPID}.json` with initial state
- Record: pipeline name, started timestamp, total steps, current_step=0

### 2. Per-Step Checkpoint
- After each step: update state file atomically
- Record: step name, status, duration_ms, output artifacts paths
- Status transitions: pending → running → completed | failed

### 3. Failure Freeze
- On step failure: mark status=halted, preserve state for resume
- Capture: error message, stack trace (if any), partial artifacts

### 4. Resume Coordination
- On `/pipeline resume`: scan `/tmp/.claude-pipeline-*-{PPID}.json`
- Return state to orchestrator: name, failed step, error, options (retry/skip/abort)
- On retry: reset failed step to pending, resume execution

## State File Schema

```json
{
  "pipeline": "{name}",
  "started": "ISO-8601",
  "status": "running|completed|halted",
  "current_step": 0,
  "steps": [
    {"name": "triage", "status": "completed", "duration_ms": 5000, "artifacts": []},
    {"name": "plan", "status": "running"}
  ]
}
```

## Integration Points

- `dag-orchestration` skill — step dependency resolution + tracker coordination
- `pipeline-guards` skill — guard gate state preservation
- `pipeline` skill — `/pipeline resume` state loader

## Rules Compliance

- R006: Agent artifact; skills (dag-orchestration, pipeline-guards) are source
- R010: File modifications via Write/Edit (prefer over Bash for .claude/ paths)
- R017: Structural changes require sauron verification
