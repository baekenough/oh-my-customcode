---
title: "AgentMemory Migration — Step 0: MEASURE"
type: guide
updated: 2026-05-18
sources:
  - guides/agentmemory-migration/measure-step-zero.md
related:
  - [[r011]]
  - [[r013]]
  - [[memory-management]]
  - [[memory-save]]
  - [[token-efficiency]]
---

# AgentMemory Migration — Step 0: MEASURE

claude-mem → native AgentMemory 마이그레이션 Phase 1(COEXIST) 진입 전 실사용 빈도를 측정하는 단계 0 가이드.

관련 이슈: [#1169](https://github.com) | 참고 메모리: `feedback_claude_mem_maintenance`, `project_sequencing_alpha_beta_gamma`

## 목적

마이그레이션 계획의 폐기 후보 5종(`make-plan`, `do`, `babysit`, `wowerpoint`, `knowledge-agent`, `pathfinder`)이 "미사용 또는 저빈도"라는 가설에 기반한다. 실측 없이 Phase 1에 진입하면 실제 사용 중인 skill이 제거되어 워크플로우가 깨질 수 있다.

## 실행 방법

```bash
# 기본 (최근 7일, ~/.claude/measure-claude-mem-usage-YYYY-MM-DD.md 저장)
bash scripts/measure-claude-mem-usage.sh

# 1주 3-포인트 수집
bash scripts/measure-claude-mem-usage.sh --output ~/.claude/claude-mem-day1.md
bash scripts/measure-claude-mem-usage.sh --days 4 --output ~/.claude/claude-mem-day4.md
bash scripts/measure-claude-mem-usage.sh --days 7 --output ~/.claude/claude-mem-day7.md
```

스캔 대상: `~/.claude-mem/archives/` (claude-mem 아카이브) + `~/.claude/projects/*/session-*.jsonl` (Claude Code 세션 로그). 어느 한쪽이 없으면 silent skip.

## 해석 기준

| 호출 수 | 신호 | 권장 조치 |
|---------|------|----------|
| 0 | 미사용 | 폐기 안전 |
| 1–3 | 가끔 사용 | wrapper 또는 대체 도구 매핑 |
| 4+ | 정기 사용 | 대체 도구 명확화 필수 |

## Phase 1 GO/NO-GO 결정

| 조건 | 결정 |
|------|------|
| 폐기 후보 전부 호출 수 0 | GO |
| 폐기 후보 중 1개 이상 1–3 | CONDITIONAL GO (대체 매핑 완료 후) |
| 폐기 후보 중 1개 이상 4+ | NO-GO (처리표 재설계 후 재측정) |

## 결과 활용

측정 완료 후:
1. `gh issue comment 1169 --body-file ~/.claude/claude-mem-day7.md` — #1169에 리포트 첨부
2. `feedback_claude_mem_maintenance.md` 자산 처리표 "처리 방향" 열 실측값으로 갱신
3. GO 결정 시 Phase 1(COEXIST) 진입

## Cross-References

- [[r011]] — native auto-memory 구조, memory scope (`user`/`project`/`local`)
- [[r013]] — ecomode, context budget (R013이 과도한 claude-mem 호출을 압박함)
- [[memory-management]], [[memory-save]], [[memory-recall]] — claude-mem skill 군
- `scripts/measure-claude-mem-usage.sh` — 측정 스크립트 (wiki 별도 페이지 없음, 도구)

## Sources

- `guides/agentmemory-migration/measure-step-zero.md` — 원본 가이드 (1주 계획, 한계 사항, 전체 해석 기준)
