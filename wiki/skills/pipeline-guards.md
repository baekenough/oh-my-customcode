---
title: Pipeline Guards
type: skill
updated: 2026-06-26
sources:
  - .claude/skills/pipeline-guards/SKILL.md
related:
  - [[pipeline]]
  - [[dag-orchestration]]
  - [[worker-reviewer-pipeline]]
  - [[stuck-recovery]]
---

# Pipeline Guards

Safety constraints and quality gates for pipeline and workflow execution.

## Overview

Defines system-wide safety limits for all pipeline execution: max iterations (3, hard cap 5), max DAG nodes (20, hard cap 30), max parallel agents (4, hard cap 5), timeouts (300s/node, 900s/pipeline), and retry counts (2, max 3). Includes a kill switch with state preservation for graceful termination. Limits can be overridden per pipeline within hard caps. Integrates with `stuck-recovery` and `model-escalation`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[pipeline]], [[dag-orchestration]], [[worker-reviewer-pipeline]], [[stuck-recovery]], [[model-escalation]]
- **See also**: [[R009]], [[R010]]

## Manifest Integrity Gate

`templates/manifest.json`의 구조 손실을 방지하는 advisory 가드. `source-hash.sh`의 path→hash 맵이 versioned manifest를 덮어쓰는 사고(#1423)를 막는다. source-hash의 올바른 타깃은 `wiki/.source-hashes.json`이며 `templates/manifest.json`이 아니다.

- staged `templates/manifest.json`에 `.version` 누락 → stage 차단 + 복구 힌트 (advisory)
- staged 내용이 path→hash 맵(`{version,…}` 구조 아님) → stage 차단 (advisory)
- `.version` + 구조 정상 → 통과

commit 전 결정론적 확인: `jq -e '.version and .components' templates/manifest.json` 성공해야 함.
복구: `git show HEAD:templates/manifest.json | jq '.version="<NEW>"' > templates/manifest.json`

## Sources

- `.claude/skills/pipeline-guards/SKILL.md` — skill definition
