# Skill Promotion: Instinct Extraction 가이드

> **관련 자산**: `skill-extractor`, `instinct-extractor`, R016 (MUST-continuous-improvement.md)

## 개요

oh-my-customcode는 두 개의 보완적인 skill 채굴 도구를 제공한다.
두 스킬은 **동일한 목표** (실패 패턴 → 영구 구조 전환)를 **다른 범위와 트리거**로 달성한다.

## 두 스킬 비교

| 속성 | `skill-extractor --mode failure` | `instinct-extractor` |
|------|----------------------------------|----------------------|
| **scope** | 단일 세션 | 다중 세션 시계열 (N일) |
| **trigger** | 명시 호출 | 자동 / R016 3회 반복 트리거 |
| **input** | `.claude/agent-memory*/feedback_*.md` | `~/.claude/projects/*/session-*.jsonl` |
| **clustering** | feedback memory의 Why/How to apply 필드 | (domain, action_verb, error_class) 튜플 |
| **output** | 기존 skill 확장 / rule 강화 / 신규 SKILL.md | failure pattern 클러스터 + instinct 후보 → SKILL.md candidate |
| **사용자 승인** | 필수 | 필수 |
| **context fork** | 신규 skill 전 cap 확인 | 신규 skill 전 cap 확인 |

## 언제 어떤 스킬을 쓸까

### skill-extractor 사용 시나리오

```
/skill-extractor               # 현재 세션 성공 패턴 추출
/skill-extractor --mode failure  # 현재 세션 누적 실패 패턴 분석
```

- 오늘 세션에서 반복된 오류를 즉시 구조화하고 싶을 때
- 특정 feedback memory 항목이 skill로 전환될 준비가 됐다고 느낄 때
- 명시적·즉각적 분석이 필요할 때

### instinct-extractor 사용 시나리오

```
/instinct-extractor                # 최근 14일 cross-session 채굴
/instinct-extractor --days 30      # 한 달 범위 확장
/instinct-extractor --dry-run      # 후보 목록만 확인
```

- R016 트리거: 동일 패턴이 여러 세션에 걸쳐 3회 이상 반복된다고 판단될 때
- 주기적 시스템 점검 (예: 릴리즈 전, 스프린트 종료 시)
- `skill-extractor`가 탐지하지 못한 cross-session 패턴이 의심될 때

## R016 자동화 패턴

R016 Defect Response Matrix에서 **Skill Promotion** 조건:
> feedback memory가 동일 패턴으로 **3회 이상 반복** → skill candidate 분석

### 권장 실행 순서

```
1. skill-extractor --mode failure
   → 현재 세션 feedback memory 분석
   → 즉각적 후보 식별

2. instinct-extractor --days 14
   → cross-session 시계열 검증
   → skill-extractor 결과와 교차 검증

3. 교차 검증: 두 스킬이 동일 패턴 발견 시 → high confidence → mgr-creator 위임
4. 한쪽만 발견 시 → medium confidence → 추가 관찰 권장
```

### 자동 트리거 조건

오케스트레이터는 다음 조건에서 `instinct-extractor` 자동 실행을 고려한다:
- R016 Defect Response Matrix 기록 시 동일 domain의 feedback memory가 3개 이상일 때
- 릴리즈 준비 단계 (`/release-plan` 실행 전)
- 스프린트 회고 (수동 트리거: `/instinct-extractor`)

## 호출 빈도 및 조건

| 시나리오 | 권장 스킬 | 주기 |
|----------|----------|------|
| 일상 개발 세션 종료 | `skill-extractor` | 세션마다 (Stop hook 알림 시) |
| 주간 점검 | `instinct-extractor --days 7` | 주 1회 |
| 릴리즈 전 | `instinct-extractor --days 30` | 릴리즈마다 |
| R016 트리거 감지 | 두 스킬 순차 실행 | 즉시 |
| 신규 에이전트 설계 전 | `instinct-extractor --cluster-only` | 필요 시 |

## Confidence 교차 검증 매트릭스

| skill-extractor 결과 | instinct-extractor 결과 | 종합 Confidence | 권장 행동 |
|---------------------|------------------------|----------------|----------|
| 후보 있음 | 동일 패턴 발견 | **high** | mgr-creator 즉시 위임 |
| 후보 있음 | 패턴 없음 | medium | 추가 세션 관찰 후 재분석 |
| 후보 없음 | 패턴 발견 | medium | skill-extractor --mode failure 재실행 |
| 후보 없음 | 패턴 없음 | low | 현재 구조 유지, 다음 주기에 재검토 |

## 아티팩트 경로

```
# skill-extractor 출력
.claude/outputs/sessions/{date}/skill-extractor-failure-{HH}.md

# instinct-extractor 출력
.claude/outputs/sessions/{date}/instinct-extractor-{HHmmss}.md

# 교차 검증 요약 (선택)
.claude/outputs/sessions/{date}/skill-promotion-summary-{HHmmss}.md
```

## 관련 자료

- `.claude/skills/skill-extractor/SKILL.md` — 명시 호출 skill 채굴
- `.claude/skills/instinct-extractor/SKILL.md` — cross-session instinct 채굴
- `.claude/rules/MUST-continuous-improvement.md` — R016 Defect Response Matrix
- `.claude/rules/MUST-agent-design.md` — context fork cap (12/12)
- `guides/skill-bundle-design/README.md` — skill 설계 패턴
- Issue #1175 — instinct-extractor 흡수 결정 맥락
- Issue #1169 — AgentMemory 마이그레이션 (transcript format 안정화 전제)
