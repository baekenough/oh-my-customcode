---
title: "Compound AI Workflow"
type: guide
updated: 2026-05-18
sources:
  - guides/compound-ai-workflow/README.md
related:
  - [[r023]]
  - [[r016]]
  - [[r011]]
  - [[r013]]
  - [[r009]]
  - [[r010]]
  - [[skill-extractor]]
  - [[structured-dev-cycle]]
  - [[pipeline]]
---

# Compound AI Workflow

Eugene Yan의 "How to Work and Compound with AI" 5원칙을 oh-my-customcode 인벤토리에 내재화한 레퍼런스 가이드. 각 세션의 artifact가 다음 세션의 context로 누적되는 compound effect 설계 철학을 다룬다.

## Overview

**compound effect**: AI와의 모든 상호작용이 소비되지 않고 다음 작업의 질·속도를 높이는 재료로 누적되는 현상. skill, memory, guide, rule이 쌓일수록 시스템은 더 빠르고 정확하게 작동한다.

## 5원칙 매핑

| Yan 원칙 | oh-my-customcode 자산 |
|---------|----------------------|
| **Context Infrastructure** | `.claude/agent-memory/`, MEMORY.md, [[r011]], `wiki/` |
| **Taste as Configuration** | `CLAUDE.md`, `.claude/rules/` (R000-R023), `.claude/output-styles/` |
| **Verification Ladders** | [[r023]], [[deep-verify]], [[adversarial-review]], `mgr-sauron` |
| **Scaled Delegation** | [[structured-dev-cycle]], `dev-lead-routing`, `/pipeline auto-dev` |
| **Loop Closure** | [[skill-extractor]] (`--mode failure`), [[r016]], `omcustom-loop` |

## Scaled Delegation 스펙트럼

| 위임 깊이 | 패턴 | 적합한 작업 |
|---------|------|-----------|
| Pair-programming | 에이전트 직접 지시 | 단일 파일 수정, ad-hoc 질문 |
| Stage-gated | [[structured-dev-cycle]] (6-stage) | 기능 구현, 복잡한 버그 수정 |
| Full delegation | `/pipeline auto-dev` | 이슈 기반 완전 자동 개발 사이클 |

## Compound Effect — 누적 구조

1. 세션 1: 새 패턴 발견 → skill 초안
2. 세션 2: skill 재사용 → 작업 시간 단축
3. 세션 3: 실패 패턴 채굴 → skill 개선 ([[r016]] + [[skill-extractor]])
4. 세션 N: 누적 skill/rule/memory가 신규 작업 context로 자동 주입

## 신규 기여자 학습 경로

```
CLAUDE.md → 본 가이드 → .claude/rules/ → .claude/skills/ → .claude/agents/ → guides/
```

## Relationships

- **Verification Ladders 상세**: [[r023]] (Tier 1-4 shift-left ladder)
- **Loop Closure 실행**: [[r016]] (continuous improvement), [[skill-extractor]]
- **Scaled Delegation 구현**: [[structured-dev-cycle]], [[pipeline]]
- **Memory 누적**: [[r011]] (memory integration), [[r013]] (ecomode)
- **병렬 실행**: [[r009]] (independent tasks → parallel)
- **위임 규칙**: [[r010]] (orchestrator → subagent delegation)

## Sources

- `guides/compound-ai-workflow/README.md` — 원본 (5원칙 상세, 스펙트럼, entry point)
- 관련 이슈: #1172 (scout:internalize compound-ai-workflow)
