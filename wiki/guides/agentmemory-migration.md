---
title: "AgentMemory Migration Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/agentmemory-migration/measure-step-zero.md
  - guides/agentmemory-migration/phase-1-coexist.md
related:
  - [[r011]]
  - [[r013]]
  - [[memory-management]]
  - [[memory-save]]
  - [[token-efficiency]]
---

# AgentMemory Migration Guide

claude-mem → native AgentMemory 마이그레이션 단계별 가이드. 현재 Phase 1 (COEXIST) 활성 중 (#1169).

관련 이슈: #1169 | 참고 메모리: `feedback_claude_mem_maintenance`, `project_sequencing_alpha_beta_gamma`

## 마이그레이션 단계

| 단계 | 이름 | 상태 | 소스 |
|------|------|------|------|
| 0 | MEASURE | 완료 | `guides/agentmemory-migration/measure-step-zero.md` |
| 1 | COEXIST | **활성** (2026-05-18~) | `guides/agentmemory-migration/phase-1-coexist.md` |
| 2 | SWITCH | 대기 (GO/NO-GO 후) | — |

---

## Step 0: MEASURE

Phase 1 진입 전 실사용 빈도를 측정하는 단계.

폐기 후보(`make-plan`, `do`, `babysit`, `wowerpoint`, `knowledge-agent`, `pathfinder`)의 "미사용 가설"을 실측으로 검증한다. 미측정 진입 시 실제 사용 중인 skill이 제거되어 워크플로우가 깨질 수 있다.

```bash
bash scripts/measure-claude-mem-usage.sh --days 7 --output ~/.claude/claude-mem-day7.md
```

**해석 기준**: 호출 수 0 → 폐기 안전 | 1–3 → wrapper 매핑 | 4+ → 대체 도구 명확화 필수

---

## Phase 1: COEXIST

claude-mem과 AgentMemory를 **동시에 운영**하는 단계. 어떤 destructive 변경도 발생하지 않는다.

### 설치 (수동, R001 auto-install 금지)

```bash
pip install agentmemory
claude mcp add agentmemory -- agentmemory mcp
```

### 운영 정책

| 작업 | 우선 backend |
|------|-------------|
| 기존 메모리 조회 | claude-mem (Chroma) |
| 신규 메모리 저장 | 둘 다 (병렬 저장) |
| 세션 종료 시 저장 | 둘 다 (R011 Session-End Self-Check 확장) |

두 backend에서 결과가 반환될 경우 `memory-aggregator` 스킬이 중복 제거 후 병합한다.

### Dual-Backend Advisory

`.mcp.json`에 `claude-mem` + `agentmemory` 동시 존재 감지 시:

```
[Advisory] Dual memory backend detected (Phase 1 COEXIST)
  현재 Phase 1 COEXIST 정책 적용 중 — 두 backend 병렬 운영
  가이드: guides/agentmemory-migration/phase-1-coexist.md
```

Phase 1에서 정상 상태이며 경고가 아니다.

### Phase 2 GO/NO-GO 기준 (2026-05-25 예정)

| 지표 | GO | NO-GO |
|------|-----|-------|
| 응답 지연 | ≤ claude-mem × 1.2 | > claude-mem × 2.0 |
| 저장 성공률 | ≥ 99% | < 95% |
| 운영 안정성 | 1주 무장애 | 크래시 또는 데이터 손실 |

### 금지 사항 (Phase 1)

- `packages/eval-core/src/adapters/agentmemory.ts` STUB 활성화 금지
- claude-mem Chroma → AgentMemory SQLite 데이터 이전 금지
- 12 plugin skill 폐기 보류

---

## Cross-References

- [[r011]] — Dual-Backend Advisory 섹션, memory scope, Session-End Self-Check 확장
- [[r013]] — ecomode context budget (과도한 claude-mem 호출 압박)
- [[memory-management]], [[memory-save]], [[memory-recall]] — claude-mem skill 군
- `scripts/measure-claude-mem-usage.sh` — 측정 스크립트

## Sources

- `guides/agentmemory-migration/measure-step-zero.md` — Step 0 원본 가이드
- `guides/agentmemory-migration/phase-1-coexist.md` — Phase 1 COEXIST 상세 가이드
