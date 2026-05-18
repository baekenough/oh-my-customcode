---
name: instinct-extractor
description: 다중 세션 transcript에서 반복 실패 패턴(instinct)을 자동 채굴하여 신규 skill candidate 생성
scope: core
user-invocable: true
argument-hint: "[--days <n>] [--min-repeat <n>] [--dry-run]"
version: 0.1.0
effort: medium
---

# Instinct Extractor

세션 transcript 시계열에서 _instinct_ (실패 학습 + 대응 본능) 패턴을 자동 채굴하여 신규 skill candidate를 생성한다.
R016 연속 개선 루프의 자동화 단계로, 사람이 명시적으로 호출하거나 R016 Skill Promotion 트리거(동일 패턴 3회 이상 반복)에 의해 자동 실행된다.

## skill-extractor와의 차별점

| 자산 | trigger | input | output |
|------|---------|-------|--------|
| `skill-extractor` | 명시 호출 (`--mode success` / `--mode failure`) | 단일 세션 task trajectory + feedback memory | SKILL.md candidate |
| `instinct-extractor` | 자동/스케줄 (R016 3회 반복 트리거) | 다중 세션 transcript 시계열 (N일 범위) | failure pattern + 대응 본능 클러스터 → SKILL.md candidate |

**보완 관계**: `skill-extractor --mode failure`는 현재 세션의 feedback memory를 분석한다.
`instinct-extractor`는 여러 세션을 가로질러 시계열 패턴을 채굴한다.
두 스킬은 경쟁하지 않으며, instinct-extractor가 발견한 후보를 skill-extractor의 결과물과 교차 검증하는 것을 권장한다.

## Usage

```
/instinct-extractor                    # 최근 14일 transcript 분석
/instinct-extractor --days 30          # 분석 범위 확장
/instinct-extractor --min-repeat 2     # 반복 임계값 낮춤 (기본: 3)
/instinct-extractor --dry-run          # 제안만 출력, 파일 미생성
```

## Options

```
--days, -d         분석할 transcript 범위 (일 단위, 기본: 14)
--min-repeat, -r   instinct 후보 최소 반복 횟수 (기본: 3)
--dry-run          후보 목록만 stdout 출력, mgr-creator 위임 없음
--cluster-only     클러스터링 결과만 출력, SKILL.md 제안 없음
```

## 입력

```
~/.claude/projects/*/session-*.jsonl   # Claude Code 세션 transcript
.claude/agent-memory*/feedback_*.md   # 누적 feedback memory (보조)
```

transcript 파일이 없을 경우: `"분석 가능한 transcript 없음 (--days 범위 내)"` 보고 후 종료.

## 워크플로우

### Phase 1: Transcript 스캔

```bash
# 분석 대상 수집
find ~/.claude/projects -name "session-*.jsonl" \
  -newer $(date -v-${DAYS}d +%Y-%m-%dT00:00:00) 2>/dev/null
```

각 transcript에서 다음 이벤트 추출:
- `type: "error"` — 오류 발생 기록
- `type: "correction"` — 사용자 수정 지시
- `type: "feedback"` — 부정 피드백 (`"no"`, `"wrong"`, `"don't"` 키워드 포함)
- `type: "retry"` — 동일 작업 재시도

### Phase 2: 패턴 클러스터링

추출된 이벤트를 `(domain, action_verb, error_class)` 튜플로 그룹화:

```
Cluster: (agent-design, write, missing-frontmatter)
  → sessions: [s1, s3, s7], count: 4
  → first_seen: 2026-05-01, last_seen: 2026-05-15
  → example_corrections: ["bypassPermissions 누락", "name 필드 없음"]
```

필터링 기준:
- `count >= --min-repeat` (기본: 3)
- `last_seen` >= 7일 이내 (오래된 패턴 제외)
- 기존 skill과 80% 이상 키워드 겹침 → 새 skill 대신 기존 skill 업데이트 제안

### Phase 3: Instinct 후보 생성

각 클러스터를 "instinct 후보"로 명명:

```
instinct: prevent-missing-bypassPermissions
  근거: 4회 반복 (2주), agent spawn 시 mode 누락
  대응 패턴: spawn 전 bypassPermissions 자가 체크
  제안 자산: 기존 R010 강화 OR 신규 guard skill
```

**분류 기준**:

| 패턴 성격 | 권장 자산 |
|-----------|----------|
| 동일 실수 반복 (행동 교정) | feedback memory 강화 |
| 워크플로우 절차 누락 | 기존 skill 섹션 추가 |
| 명확한 재사용 루틴 | 신규 SKILL.md 제안 |
| 규칙 미준수 (R007~R022) | 해당 rule 자가 체크 섹션 강화 제안 |

context fork cap (12개) 확인: 신규 skill이 `context: fork` 필요 시 현재 사용량 체크.
현재 cap: 10/12 (secretary/dev-lead/de-lead/qa-lead-routing, dag-orchestration, task-decomposition, worker-reviewer-pipeline, deep-plan, professor-triage, roundtable-debate).

### Phase 4: 사용자 제시

```
[instinct-extractor] {N}개 instinct 후보 발견 (최근 {DAYS}일, {M}개 세션)

  1. [high] prevent-missing-bypassPermissions
     반복: 4회 | 마지막: 2026-05-15 | 도메인: agent-design
     대응 본능: spawn 전 mode 체크 → skill 후보: bypassPermissions-guard

  2. [medium] transcript-scan-format-mismatch
     반복: 3회 | 마지막: 2026-05-10 | 도메인: memory
     대응 본능: JSONL 파싱 전 format 버전 체크

생성할 항목 선택 [1-N], "all", 또는 "skip":
```

### Phase 5: Skill Candidate 생성 (승인 시)

mgr-creator에 위임:
- 후보 이름 및 설명
- 클러스터 데이터 (반복 횟수, 예시 수정 사항)
- 분류 결과 (신규 skill / 기존 확장 / rule 강화)
- 기존 skill과의 겹침 경고

## 아티팩트 출력

```
.claude/outputs/sessions/{YYYY-MM-DD}/instinct-extractor-{HHmmss}.md
```

CC v2.1.121+ 환경에서 `.claude/outputs/` 직접 Write 가능 (`bypassPermissions` 모드).
CC < v2.1.121 환경: `/tmp/instinct-extractor-{ts}.md` 경유 후 이동.

## R016 자동화 연동

R016 Defect Response Matrix의 "Skill Promotion" 조건:
> feedback memory가 동일 패턴으로 3회 이상 반복 → skill-extractor `--mode failure` 실행 권장

`instinct-extractor`는 이 조건을 **cross-session 범위로 확장**한다:
- 단일 세션의 feedback memory 분석 → `skill-extractor --mode failure`
- 다중 세션 시계열 채굴 → `instinct-extractor`

R016 트리거 감지 시 오케스트레이터는 두 스킬을 순차 실행하여 결과를 교차 검증할 수 있다.

## 통합

| 시스템 | 연동 방식 |
|--------|----------|
| `skill-extractor --mode failure` | 보완 관계 — 결과 교차 검증 권장 |
| R016 (continuous-improvement) | 3회 반복 트리거 → 자동 실행 후보 |
| mgr-creator | 승인된 후보 SKILL.md 생성 위임 |
| sys-memory-keeper | 채굴 결과를 project memory로 보존 |
| feedback-collector | feedback 이벤트 소스 공유 |
| R011 (memory) | User Model의 Override Decisions 반영 |

## 안전 규칙

- **사용자 승인 필수**: skill 자동 생성 없음, 항상 사용자 확인 후 mgr-creator 위임
- **중복 체크**: 기존 skill과 80%+ 겹침 시 신규 생성 대신 업데이트 권장
- **dry-run 모드**: 부작용 없는 미리보기
- **context fork cap 체크**: `context: fork` 필요 skill은 cap(12) 초과 여부 사전 확인

## 한계

- **transcript 형식 의존**: CC `session-*.jsonl` 스키마 변경 시 파싱 재구현 필요.
  AgentMemory 마이그레이션(#1169, Phase 3 DECOUPLE) 완료 후 transcript 경로/형식 재검토 예정.
- **클러스터링 정확도**: 키워드 기반 클러스터링으로 의미적 동의어 처리 제한.
- **Phase γ 제약**: #1169 AgentMemory Phase 3 이전에는 transcript 형식 불안정 — `--dry-run` 권장.
