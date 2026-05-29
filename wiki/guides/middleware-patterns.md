---
title: Middleware Patterns Guide
type: guide
updated: 2026-04-27
sources:
  - guides/middleware-patterns/README.md
related:
  - [[guides/harness-engineering]]
  - [[skills/pre-generation-arch-check]]
  - [[skills/action-validator]]
  - [[skills/result-aggregation]]
  - [[skills/evaluator-optimizer]]
  - [[R006]]
  - [[R009]]
  - [[R013]]
  - [[R021]]
---

# Middleware Patterns Guide

LangChain 6-stage lifecycle middleware 모델을 oh-my-customcode 기존 자산에 매핑한 통합 어휘 가이드. 신규 훅·스킬 작성 시 어느 lifecycle 단계에 속하는지 명시하는 관행 확립이 목적. (관련 이슈: #1022)

## Lifecycle 6단계 매핑

| LangChain Hook | oh-my-customcode 대응 | 예시 |
|---|---|---|
| `before_agent` | `SessionStart`, `UserPromptSubmit` | 세션 시작 컨텍스트 로드, R007 헤더 |
| `before_model` | `PreToolUse(Agent)`, `pre-generation-arch-check` | 아키텍처 경계 검사 |
| `wrap_model_call` | Tier 4 permission gate, `bypassPermissions` | Bash/WebFetch 승인 |
| `wrap_tool_call` | `PreToolUse(*) + PostToolUse(*)` | action-validator, rule-deletion-guard |
| `after_model` | `PostToolUse(Agent)`, `result-aggregation` | 병렬 결과 합산, evaluator-optimizer |
| `after_agent` | `Stop`, `SubagentStop` | sys-memory-keeper, omcustom-loop |

## 주요 패턴 3종

**PII 마스킹** — `UserPromptSubmit` 훅에서 입력 마스킹 + `PostToolUse`에서 감사. `before_agent` + `wrap_tool_call` 조합 권장.

**요약** — R013 ecomode(컨텍스트 80%+ 자동 압축) + result-aggregation(병렬 결과 합산) + PreCompact 훅(checkpoint). Deep Insight Context Handoff Pattern과 연동.

**재시도** — R004의 3회 지수 백오프(1s/2s/4s) 정책이 `wrap_model_call` 단계에 명문화.

## Hook vs Skill 결정 기준

| 필요 요건 | Hook | Skill |
|---|---|---|
| 자동 실행 / 하드 블록(exit 2) | ✅ | — |
| 복잡한 로직 / 에이전트 스폰 | — | ✅ |
| 세션 전체 항상 실행 | ✅ | — |
| 사용자 직접 호출 | — | ✅ |

## 신규 Middleware 단계 결정 플로우

```
에이전트 시작/종료 → before_agent / after_agent
모델 추론 직전/직후 → before_model / after_model
개별 도구 전후 → wrap_tool_call
모델 호출 자체 제어 → wrap_model_call
```

SKILL.md `description` 첫 줄에 `[lifecycle: <단계>]` 명시 권장.

## Related

- Guide: [[guides/harness-engineering]] — 3-Layer Hierarchy, 에이전트 구조 설계. middleware-patterns의 "어느 단계에" 문제의 구현 상세.
- Rules: [[R001]] (금지 행동), [[R002]] (Permission Tiers), [[R004]] (재시도 정책), [[R006]] (훅 선언)
- Skills: [[skills/action-validator]], [[skills/pipeline-guards]], [[skills/worker-reviewer-pipeline]]
