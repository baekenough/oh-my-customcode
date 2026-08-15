# Agora 익명 합의 스킬 재설계 스펙

> 작성일: 2026-08-15 | 대상: `.claude/skills/agora/` (재도입) | 저장소: oh-my-customcode (develop @ `1b4973d5`)

---

## 1. 개요와 배경

`agora` 스킬은 v0.159.0(2026-05-30, 커밋 `0d719599`, 이슈 #1255)에서 제거되었습니다. 제거 사유는 스킬 자체의 결함이 아니라, 스킬이 의존하던 `codex-exec` / `gemini-exec` 스킬을 정리하면서 딸려 나간 것이었습니다. 원본은 `git show 0d719599^:.claude/skills/agora/SKILL.md` 로 열람할 수 있으며, Agent Teams(`TeamCreate`) 기반 7-Phase 구조였습니다.

현재 실행 환경에서는 `TeamCreate` / `TeamDelete`가 도구 목록에 존재하지 않습니다(R018 Detection 기준 dormant, R002 「Todo/Task 도구 기본 제거」 실측). 팀 생성 경로 자체가 없으므로 원본 구조를 그대로 되살릴 수 없습니다. 본 설계는 Agent Teams 의존을 제거하고, 여기에 **익명화**를 1급 요구사항으로 추가하여 재설계한 것입니다.

### 원본과의 차이

| 축 | 원본 (v0.159.0 이전) | 본 재설계 |
|----|---------------------|-----------|
| 조율 기반 | Agent Teams (`TeamCreate` + 공유 작업 목록 + `SendMessage`) | 셸 스크립트 + 파일 기반 상태 + 단일 위임 에이전트 |
| 참여자 호출 | `codex-exec` / `gemini-exec` 스킬 경유 | CLI 직접 호출 (`claude -p` / `omx exec` / `agy -p`) |
| 익명성 | 없음 — 심판이 벤더를 알고 평가 | 라운드마다 셔플되는 A/B/C 라벨, 서식 정규화 |
| 심판 | 팀 내 역할 | 별도 프로세스 + 매 라운드 모델 로테이션 |
| 판정 체계 | `BUILD / BUILD_WITH_CHANGES / REDESIGN / ABANDON` | 동일 (계승) |

### 재설계 동기

1. **벤더 편향 제거** — 심판이 "이건 Opus 의견"임을 알면 모델 명성이 논증 품질을 대체합니다. 익명화는 논증만 남기기 위한 장치입니다.
2. **환경 정합성** — Agent Teams 부재 환경에서 실행 가능한 구조가 필요합니다.
3. **재현성** — 셔플 시드를 기록해 라운드 결과를 사후 감사할 수 있어야 합니다.

---

## 2. 요구사항

확정된 설계 결정을 요구사항 형태로 정리합니다. 아래 항목은 사용자 인터뷰로 확정된 것이며 구현 단계에서 임의 변경하지 않습니다.

| ID | 요구사항 |
|----|----------|
| REQ-1 | 리뷰어는 3벤더 고정: `claude -p --model claude-opus-4-8`, `omx exec`, `agy -p --model gemini-3.1-pro-high` |
| REQ-2 | 익명 라벨(A/B/C)은 **라운드마다 셔플**한다. 과거 라운드 의견도 현재 라운드 매핑으로 **재라벨링**하여 제시한다 |
| REQ-3 | 심판은 리뷰어와 **별도 프로세스**로 실행하며, 매 라운드 모델을 로테이션한다. R1 `claude -p --model claude-opus-5`, R2 `agy -p --model claude-opus-4-6-thinking`, R3 `agy -p --model gpt-oss-120b-medium`, R4부터 순환. 심판 3종은 리뷰어 3종과 **모델 단위로 전혀 겹치지 않는다** |
| REQ-4 | 입력은 자유 주제 문장 + 선택적 첨부 문서 경로. 판정 체계는 `BUILD \| BUILD_WITH_CHANGES \| REDESIGN \| ABANDON`, 심각도는 `CRITICAL \| HIGH \| MEDIUM \| LOW` |
| REQ-5 | 종료 조건 4종을 구현한다 (합의 / 정체 / 상한 / 사용자 중단). 상세는 §9 |
| REQ-6 | 심판의 권한은 세 가지다: 평가, 다음 라운드 의제 설정, 재작성된 통합 초안 제시 |
| REQ-7 | 익명화 강도는 **서식 정규화** 수준이다. 고정 템플릿 필드로 응답을 강제 재배치하여 문체 지문을 줄인다 |
| REQ-8 | 매 라운드 사용자 게이트가 기본 동작이며, `--auto` 플래그로 게이트를 생략할 수 있다 |

### 환경 실측 전제

아래는 설계 시점(2026-08-15)에 실측한 사실이며, 설계는 이 값들을 전제로 합니다.

| 항목 | 실측 결과 |
|------|-----------|
| `omx` | `/opt/homebrew/bin/omx` (oh-my-codex v0.20.3). `omx exec <prompt>` 비대화형 동작 확인 (exit 0, 18.6k 토큰 소모) |
| `agy` | Antigravity CLI v1.1.13. `agy -p <prompt>` 동작 확인 (exit 0). 옵션: `--model`, `--effort`, `--output-format text\|json\|stream-json`, `--json-schema`, `--print-timeout`(기본 5m) |
| `agy models` | gemini-3.7/3.6/3.5-flash-{high,medium,low}, gemini-3.1-pro-{high,low}, claude-sonnet-4-6, claude-opus-4-6-thinking, gpt-oss-120b-medium |
| `gemini` CLI | `/opt/homebrew/bin/gemini` v0.38.2 — **인증 불가**. `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`. 사용 불가하며 `agy`가 대체 경로 |
| `claude -p` | `claude -p --model claude-opus-4-8 <prompt>` 동작 확인 (exit 0). **CLI는 Tier-2 full model ID를 수용**한다 |
| Agent tool `model` | `sonnet \| opus \| haiku \| fable` 4값만 수용 (R006 Tier 3) — full ID 불가. 따라서 특정 full ID 모델 지정은 **CLI 경로로만** 가능하다 |
| `.gitignore:43` | `!.claude/skills/` 화이트리스트 존재 → 스킬 하위 `scripts/` 파일은 git tracked 가능 (선례: `.claude/skills/systematic-debugging/find-polluter.sh`) |
| 스크립트 보유 스킬 | 현재 114개 스킬 중 `systematic-debugging` 1개뿐. `agora`가 두 번째가 된다 |

`claude -p`가 full model ID를 수용하고 Agent tool은 4-alias만 수용한다는 비대칭이 본 설계의 구조를 결정합니다 — 심판/리뷰어 모델을 정밀 지정하려면 서브에이전트 스폰이 아니라 **CLI 호출**이어야 합니다.

---

## 3. 컴포넌트 구조

```
.claude/skills/agora/
├── SKILL.md
└── scripts/
    ├── agora.sh        # 진입점 + 라운드 상태 + 종료 판정
    ├── reviewers.sh    # 3벤더 병렬 호출 어댑터
    ├── anonymize.sh    # 정규화 → 셔플 → 라벨 → 매핑 격리
    └── judge.sh        # 별도 프로세스 심판 호출 (모델 로테이션)
```

### 스크립트별 책임

| 파일 | 책임 | 비고 |
|------|------|------|
| `agora.sh` | 진입점. 인자 파싱(`<topic>`, `--attach`, `--max-rounds`, `--auto`), 아티팩트 디렉토리 생성, 라운드 루프 구동, `state.json` 갱신, 종료 판정 | **종료 판정은 순수 함수로 구현한다** — 상태 JSON을 stdin으로 받아 판정 문자열을 stdout으로 내는 형태여야 `bun test`에서 부작용 없이 검증할 수 있습니다 |
| `reviewers.sh` | 3벤더를 병렬 호출하는 어댑터. 벤더별 CLI 인자 차이(`-p` vs `exec`, `--json-schema` 유무)를 흡수하고, 결과를 `SEALED/raw/round-N/{vendor}.json` 에 기록 | 타임아웃 300s, 1회 재시도, 결측 허용은 §11 |
| `anonymize.sh` | `SEALED/raw/` 를 읽어 (1) 템플릿 필드로 정규화 → (2) 시드 기반 셔플 → (3) A/B/C 라벨 부여 → (4) 매핑을 `SEALED/mapping/` 에, 익명 번들을 `anon/` 에 각각 기록 | **매핑과 익명 번들을 서로 다른 디렉토리에 쓰는 유일한 지점**입니다. 익명화 경계의 소유자 |
| `judge.sh` | 라운드 번호로 모델을 로테이션 선택하고, `anon/round-N.json` 만을 입력으로 심판 CLI를 별도 프로세스로 호출. 결과를 `verdict/round-N.json` 에 기록 | 심판은 `SEALED/` 경로를 인자로도 환경변수로도 받지 않습니다 |

### 호출 관계

```
agora.sh
  ├─(라운드 N 시작)→ reviewers.sh  → SEALED/raw/round-N/*.json
  ├─                 anonymize.sh  → SEALED/mapping/round-N.json + anon/round-N.json
  ├─                 judge.sh      → verdict/round-N.json
  ├─(state.json 갱신 + 종료 판정)
  └─(종료)→ report.md 생성 (이 단계에서만 mapping 사용)
```

---

## 4. 신뢰 경계와 산출물 레이아웃

아티팩트 루트는 R006 Artifact Output Convention을 따릅니다.

```
.claude/outputs/sessions/{YYYY-MM-DD}/agora-{topic}-{HHmmss}/
├── SEALED/
│   ├── raw/
│   │   └── round-N/{claude,omx,agy}.json     # 벤더 원문 (벤더명이 파일명에 노출됨)
│   └── mapping/
│       └── round-N.json                       # 라벨 ↔ 벤더 매핑 + 시드
├── anon/
│   └── round-N.json                           # 익명 번들 (심판 입력)
├── verdict/
│   └── round-N.json                           # 심판 산출
├── state.json                                  # 세션 상태
└── report.md                                   # 최종 보고서 (여기서만 익명 해제)
```

### 핵심 원칙: 익명화 경계 = 파일 경계

익명성을 프롬프트 지시("벤더를 언급하지 마세요")로 유지하지 않습니다. **디렉토리 경계**로 유지합니다.

| 주체 | `SEALED/` 접근 | `anon/` 접근 | 근거 |
|------|:---:|:---:|------|
| 오케스트레이터 (메인 대화) | 금지 | 허용 | 게이트 표시에 익명 요약만 필요 |
| `agora-runner` 에이전트 | 금지 | 허용 | 라운드 실행 위임 대상, verdict 요약만 반환 |
| 리뷰어 CLI 3종 | 금지 | 금지 | 서로의 의견을 라운드 내에서 보지 않음 (R1 독립성) |
| 심판 CLI | 금지 | 허용 | 익명 번들만이 유일한 입력 |
| `report.md` 생성 단계 | **허용** | 허용 | 익명 해제가 이 단계의 목적 |

`SEALED/` 를 읽는 것은 `agora.sh` 의 report 생성 함수와 `anonymize.sh` 뿐입니다. `judge.sh` 는 `SEALED/` 경로를 인자로 받지 않으므로, 심판이 매핑을 참조하려면 명시적으로 파일 시스템을 탐색해야 하며 이는 프롬프트가 요구하지 않는 행동입니다.

### 한계 — 이 격리는 규약이며 하드 블록이 아닙니다

정직하게 명시합니다. 위 표는 **관례(convention)** 이지 강제(enforcement)가 아닙니다.

- 오케스트레이터도 심판 CLI도 파일 읽기 능력 자체는 가지고 있습니다. `SEALED/` 를 읽지 **못하는** 것이 아니라 읽지 **않도록 설계**된 것입니다.
- PreToolUse 훅으로 `SEALED/` 경로 Read를 하드 블록하는 방안은 검토했으나, 훅은 프로젝트 전역에 영향을 주고 R021 Enforcement Tiers 상 Hard Block 승격은 위반율 임계 초과를 요건으로 하므로 초기 도입에서는 제외합니다.
- 따라서 실질 방어선은 §12의 Tier-1 검증(익명 번들에 벤더 지문이 없는지 결정론적으로 검사)입니다. 이는 "누출이 발생했는가"를 사후 탐지하며, "누출을 시도할 수 없게" 만들지는 않습니다.
- 위반율이 관측되면 R021 Hard Enforcement Candidates로 승격을 검토합니다.

---

## 5. 정규화 템플릿 스키마

리뷰어 응답은 자유 산문이 아니라 아래 고정 필드 JSON이어야 합니다. 이것이 REQ-7 "서식 정규화" 익명화의 실체입니다 — 문체·구성·분량의 벤더 지문을 템플릿이 흡수합니다.

```json
{
  "findings": [
    {
      "id": "F1",
      "severity": "CRITICAL",
      "claim": "제안된 상태 파일이 동시 라운드 실행에서 경합한다",
      "evidence": "state.json 이 단일 경로이며 파일 잠금 기술이 없음 (설계 §9)",
      "impact": "두 세션이 같은 날짜 디렉토리를 쓰면 라운드 카운터가 덮어써짐",
      "counter": "세션 디렉토리에 HHmmss 가 포함되므로 실제 충돌 확률은 낮음",
      "verdict": "MODIFY"
    }
  ],
  "overall": "BUILD_WITH_CHANGES",
  "rationale": "핵심 구조는 타당하나 상태 경합과 심판 실패 경로에 보강이 필요함"
}
```

### 필드 정의

| 경로 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `findings[]` | array | Y | 지적 사항 목록. 빈 배열 허용(= 이견 없음) |
| `findings[].id` | string | Y | 라운드 내 고유 식별자. `F1`, `F2` … 형식 |
| `findings[].severity` | enum | Y | `CRITICAL \| HIGH \| MEDIUM \| LOW` |
| `findings[].claim` | string | Y | 주장. 한 문장 |
| `findings[].evidence` | string | Y | 근거. 첨부 문서/주제문 내 위치를 인용 |
| `findings[].impact` | string | Y | 방치 시 결과 |
| `findings[].counter` | string | Y | **자기 주장에 대한 반론**. 빈 문자열 금지 — 반론을 못 쓰면 그 finding은 제출하지 않는다 |
| `findings[].verdict` | enum | Y | `KEEP \| MODIFY \| REJECT` — 지적 대상 요소를 어떻게 할지 |
| `overall` | enum | Y | `BUILD \| BUILD_WITH_CHANGES \| REDESIGN \| ABANDON` |
| `rationale` | string | Y | `overall` 판정의 근거. 2~3 문장 |

`counter` 필드를 필수로 둔 것은 익명화와 별개의 품질 장치입니다. 반론을 강제하면 단정적 어조가 억제되어 부수적으로 벤더 문체 지문도 함께 줄어듭니다.

### 벤더별 계약 강제 수단

| 벤더 | 수단 |
|------|------|
| `agy` | `--json-schema <path>` 로 스키마를 강제하고 `--output-format json` 으로 수신. CLI가 계약을 보증 |
| `omx` | 프롬프트에 스키마를 포함 + 수신 후 파싱 검증. 실패 시 §11 절차 |
| `claude -p` | 프롬프트에 스키마를 포함 + 수신 후 파싱 검증. 실패 시 §11 절차 |

`agy` 만 하드 계약을 가지므로 세 벤더의 응답 신뢰도가 균일하지 않습니다. 이를 보정하기 위해 파싱 검증은 세 벤더 모두에 동일하게 적용하며, `agy` 응답도 스키마 재검증을 거칩니다.

---

## 6. 익명 번들 스키마

심판에게 전달되는 유일한 입력입니다.

```json
{
  "round": 2,
  "topic": "세션 메모리를 SQLite로 이전할 것인가",
  "attachments": ["docs/memory-unification/schema.md"],
  "agenda": [
    "마이그레이션 실패 시 롤백 경로",
    "MEMORY.md 200줄 예산과의 정합"
  ],
  "reviewers": [
    {
      "label": "A",
      "findings": [ /* §5 findings[] 와 동일 구조 */ ],
      "overall": "BUILD_WITH_CHANGES",
      "rationale": "…"
    },
    { "label": "B", "findings": [], "overall": "BUILD", "rationale": "…" },
    { "label": "C", "findings": [], "overall": "REDESIGN", "rationale": "…" }
  ],
  "prior_rounds": [
    {
      "round": 1,
      "reviewers": [
        { "label": "B", "overall": "BUILD_WITH_CHANGES", "rationale": "…" }
      ],
      "verdict": "BUILD_WITH_CHANGES",
      "draft": "…"
    }
  ]
}
```

### 필드 정의

| 경로 | 설명 |
|------|------|
| `round` | 현재 라운드 번호 (1-indexed) |
| `topic` | 사용자가 입력한 자유 주제 문장 원문 |
| `attachments[]` | 첨부 문서 경로 목록. 심판은 이 경로를 직접 읽을 수 있음 |
| `agenda[]` | 직전 라운드 심판이 설정한 의제. R1에서는 빈 배열 |
| `reviewers[]` | 이번 라운드 익명 리뷰어 응답. 항상 라벨 오름차순(A, B, C)으로 정렬 |
| `prior_rounds[]` | 과거 라운드 요약. **직전 2라운드만** 포함 (§11 비용 통제) |

### 과거 라운드 재라벨링 규칙

`prior_rounds[]` 안의 `label` 값은 **그 라운드 당시의 라벨이 아니라 현재 라운드 매핑으로 변환된 라벨**입니다.

변환 규칙: 라운드 N의 번들을 만들 때, 과거 라운드 M의 각 응답에 대해 `vendor = mapping[M].map⁻¹(label_M)` 로 벤더를 복원한 뒤 `label_N = mapping[N].map⁻¹(vendor)` 로 재부여합니다.

**근거**: 순진하게 라운드별 셔플만 적용하면 라운드 1의 A와 라운드 2의 A가 서로 다른 벤더가 됩니다. 심판은 이를 "A가 입장을 바꿨다"로 오독하여 존재하지 않는 일관성 결여를 지적하게 됩니다. 재라벨링은 이 오독을 제거하면서도 벤더 정체는 감춥니다 — 심판이 관찰하는 것은 "동일 참여자의 라운드 간 변화"이지 "그 참여자가 누구인가"가 아닙니다.

### 남는 누출 — 라운드 내 일관성은 관찰 가능합니다

정직하게 명시합니다.

- 셔플은 라운드 **간** 라벨-벤더 연결을 끊지만, 한 라운드 **내** 에서는 라벨이 곧 그 벤더의 전체 응답을 묶습니다. 심판은 "A의 findings 5건이 모두 성능 축에 집중되어 있다"와 같은 스타일 패턴을 관찰할 수 있습니다.
- 재라벨링을 도입한 이상 `prior_rounds[]` 를 통해 라운드 간 일관성도 관찰 가능해집니다. 이는 의도된 트레이드오프입니다 — 일관성 오독 방지가 벤더 추론 위험보다 크다고 판단했습니다.
- 서식 정규화(§5)는 문체 지문을 줄이지만 **논증 스타일 지문은 줄이지 못합니다**. 특정 모델이 반복적으로 특정 축을 파고드는 경향은 템플릿으로 흡수되지 않습니다.
- 결론적으로 본 설계의 익명성은 "벤더 식별 불가"가 아니라 **"벤더 식별이 심판의 기본 관찰 경로에 놓이지 않음"** 수준입니다. 결정적 익명성을 주장하지 않습니다.

---

## 7. 매핑 스키마

`SEALED/mapping/round-N.json` — 오케스트레이터·심판이 읽지 않는 격리 파일입니다.

```json
{
  "round": 2,
  "seed": "agora-1755230400-r2",
  "map": {
    "A": "agy:gemini-3.1-pro-high",
    "B": "claude:claude-opus-4-8",
    "C": "omx:default"
  }
}
```

### 필드 정의

| 경로 | 설명 |
|------|------|
| `round` | 라운드 번호 |
| `seed` | 셔플에 사용한 시드 문자열. `agora-{세션epoch}-r{round}` 형식 |
| `map` | 라벨 → `{cli}:{model}` 문자열. 결측 벤더는 키에서 제외되며, 이 경우 `map` 의 항목 수가 3보다 작습니다 |

### `seed` 를 기록하는 이유

1. **재현성** — 같은 시드로 같은 셔플이 나와야 라운드를 재실행해 결과를 대조할 수 있습니다. 셔플이 비결정적이면 "이번엔 왜 다른 결론이 나왔는가"를 셔플 탓인지 모델 탓인지 분리할 수 없습니다.
2. **감사 가능성** — 셔플이 실제로 균등했는지 사후 검증할 수 있습니다. §12의 라벨 분포 균등성 테스트가 이 시드를 사용합니다.
3. **결함 재현** — 특정 라벨 배치에서만 나타나는 심판 편향을 발견했을 때 그 배치를 재구성할 수 있습니다.

시드는 세션 epoch를 포함하므로 세션 간에는 항상 다릅니다. 즉 재현성은 "같은 세션 아티팩트를 재처리할 때"에 한정되며, 새 세션이 과거 셔플을 반복하지는 않습니다.

---

## 8. 심판 산출 스키마

`verdict/round-N.json` — 심판 CLI의 유일한 산출물입니다.

```json
{
  "round": 2,
  "judge": "agy:claude-opus-4-6-thinking",
  "consensus": "MAJORITY",
  "verdict": "BUILD_WITH_CHANGES",
  "resolved": [
    { "id": "F1", "resolution": "상태 파일에 HHmmss 세션 디렉토리 격리로 충분 — A/B 동의, C 미제기" }
  ],
  "unresolved": [
    { "id": "F4", "severity": "HIGH", "positions": "A는 REJECT, C는 KEEP, B는 미언급" }
  ],
  "agenda": [
    "F4 의 심각도 판정 근거를 각자 제시할 것",
    "롤백 경로의 구체적 명령 시퀀스"
  ],
  "draft": "## 통합 초안 (라운드 2)\n\n…",
  "new_findings": 2,
  "notes": "리뷰어 3인 전원 응답. C의 REDESIGN 판정은 단일 근거에 의존함"
}
```

### 필드 정의

| 경로 | 타입 | 설명 |
|------|------|------|
| `round` | number | 라운드 번호 |
| `judge` | string | 이번 라운드 심판의 `{cli}:{model}`. 감사용이며 익명 대상이 아님(심판은 익명화 주체이지 대상이 아님) |
| `consensus` | enum | `UNANIMOUS \| MAJORITY \| SPLIT \| NONE`. 리뷰어 `overall` 값의 일치도에 대한 심판의 판정 |
| `verdict` | enum | `BUILD \| BUILD_WITH_CHANGES \| REDESIGN \| ABANDON`. 심판의 종합 판정 |
| `resolved[]` | array | 이번 라운드에 해소된 쟁점. `{id, resolution}` |
| `unresolved[]` | array | 미해소 쟁점. `{id, severity, positions}` — `positions` 는 라벨별 입장 요약 |
| `agenda[]` | array | **다음 라운드 의제**. REQ-6의 심판 권한 2 |
| `draft` | string | **재작성된 통합 초안**. REQ-6의 심판 권한 3. 마크다운 문자열 |
| `new_findings` | number | 이번 라운드에 처음 등장한 finding 개수. 정체 판정(§9)의 입력 |
| `notes` | string | 심판 자유 서술. 참여 인원 결측 등 |

`consensus` 와 `verdict` 는 독립 축입니다 — 전원이 `REDESIGN` 으로 일치하면 `UNANIMOUS` + `REDESIGN` 이며, 이는 합의 종료 조건에 해당하지 **않습니다**(§9 참조).

---

## 9. 세션 상태와 종료 판정

`state.json`:

```json
{
  "round": 2,
  "max_rounds": 5,
  "mode": "gated",
  "history": [
    { "round": 1, "verdict": "REDESIGN",            "consensus": "SPLIT",    "new_findings": 9, "max_severity": "CRITICAL", "tokens": 94000 },
    { "round": 2, "verdict": "BUILD_WITH_CHANGES",  "consensus": "MAJORITY", "new_findings": 2, "max_severity": "HIGH",     "tokens": 71000 }
  ],
  "stop": null
}
```

| 경로 | 설명 |
|------|------|
| `round` | 완료된 최신 라운드 번호 |
| `max_rounds` | 상한. 기본 5, `--max-rounds` 로 조정 |
| `mode` | `gated`(기본) 또는 `auto`(`--auto` 플래그) |
| `history[]` | 라운드별 요약. 정체 판정과 비용 표시의 입력 |
| `history[].max_severity` | 해당 라운드 `unresolved[]` 중 최고 심각도. 미해소 없으면 `NONE` |
| `stop` | 종료 사유 코드 또는 `null`(진행 중) |

### 종료 조건 4종

| 코드 | 조건 | 판정식 | 결과 보고 |
|------|------|--------|-----------|
| `CONSENSUS` | 합의 종료 | `consensus == "UNANIMOUS"` **AND** `verdict ∈ {BUILD, BUILD_WITH_CHANGES}` | 합의 도달. 심판 최종 `draft` 를 결론으로 채택 |
| `STALLED` | 정체 조기종료 | `new_findings == 0` **AND** `max_severity` 가 직전 라운드와 동일한 상태가 **2라운드 연속** | 정체. 잔존 쟁점을 그대로 보고하며 결론을 강제하지 않음 |
| `MAX_ROUNDS` | 상한 종료 | `round == max_rounds` | 잔존 쟁점을 **"합의 없음 · 분기 결정 필요"** 로 명시 보고 |
| `USER` | 사용자 게이트 중단 | 게이트에서 `s` 선택 | 그 시점까지의 결과로 보고서 생성 |

`UNANIMOUS` + `REDESIGN` / `ABANDON` 은 합의 종료에 해당하지 않습니다. 전원이 재설계를 요구한 상태는 "결론이 났다"가 아니라 "현 초안이 폐기되었다"이므로, 다음 라운드에서 심판의 재작성 초안을 다시 검증할 기회를 남깁니다.

종료 판정은 `agora.sh` 내 순수 함수로 구현합니다 — `state.json` 내용을 stdin으로 받아 `CONSENSUS|STALLED|MAX_ROUNDS|USER|CONTINUE` 중 하나를 stdout으로 출력하며, 파일 시스템이나 네트워크에 접근하지 않습니다. §12의 테스트가 이 함수를 직접 호출합니다.

---

## 10. 라운드 루프와 사용자 게이트

### 라운드 입력 구성

| 라운드 | 리뷰어 입력 |
|--------|------------|
| R1 | `topic` + `attachments` 만. `agenda` 없음, `prior_rounds` 없음, 통합 초안 없음 |
| R2 이상 | `topic` + `attachments` + 직전 심판의 `agenda` + `prior_rounds`(직전 2라운드) + 직전 심판의 `draft` |

**R1이 백지 독립 리뷰인 이유**: 의제나 초안이 주어지면 리뷰어는 그 프레임 안에서만 사고합니다. R1은 세션 전체에서 **진짜 독립 의견을 얻는 유일한 라운드**이므로 어떤 사전 프레임도 주입하지 않습니다. R2부터는 수렴이 목적이므로 프레임 주입이 오히려 필요합니다.

### 라운드 루프

```
[R1] reviewers(topic, attachments) → anonymize → judge(anon) → verdict
       └─ 종료 판정 → CONTINUE → 게이트
[R2] reviewers(topic, attachments, agenda, prior_rounds[R1], draft) → anonymize → judge → verdict
       └─ 종료 판정 → …
```

### 사용자 게이트 표시 형식

`mode: gated` 에서 매 라운드 종료 후 오케스트레이터가 표시합니다. **벤더는 노출하지 않고 라벨만 노출합니다** — 벤더 공개는 최종 `report.md` 에서만 이루어집니다.

```
─── Agora Round 2/5 ───────────────────────────────
심판:      (모델 로테이션 #2)
Consensus: MAJORITY          Verdict: BUILD_WITH_CHANGES
리뷰어:    A BUILD_WITH_CHANGES · B BUILD · C REDESIGN
신규 지적: 2건               최고 심각도: HIGH
누적 토큰: 165k (R1 94k + R2 71k)

해소됨(1)
  F1  상태 파일 경합 — 세션 디렉토리 격리로 충분

미해소(1)
  F4  [HIGH] 롤백 경로 부재 — A REJECT / C KEEP / B 미언급

다음 라운드 의제
  1. F4 의 심각도 판정 근거를 각자 제시할 것
  2. 롤백 경로의 구체적 명령 시퀀스

[c] 계속  [s] 중단하고 보고서  [e] 의제 추가 후 계속
```

### 게이트 옵션

| 키 | 동작 |
|----|------|
| `c` | 다음 라운드 진행. 심판 의제를 그대로 사용 |
| `s` | 루프 종료(`stop: "USER"`), 현재까지의 결과로 `report.md` 생성 |
| `e` | 사용자 의제를 입력받아 심판 `agenda[]` 에 **추가**한 뒤 다음 라운드 진행 |

`e` 는 **추가만 가능하며 심판 의제를 덮어쓰지 못합니다**. 사용자가 심판 의제를 삭제할 수 있으면 심판의 REQ-6 권한(의제 설정)이 형해화되고, 사용자가 불편해하는 쟁점이 조용히 사라지는 경로가 생깁니다. 사용자 의제는 심판 의제 뒤에 append 되며 출처가 `user` 로 표시됩니다.

`mode: auto` 에서는 게이트를 표시하지 않고 종료 조건 (a)(b)(c) 중 하나가 성립할 때까지 진행합니다. `--auto` 는 비용 상한이 명확할 때만 사용하도록 SKILL.md에 경고를 둡니다.

---

## 11. 실패 처리와 비용 통제

### 실패 처리 표

| 실패 | 처리 |
|------|------|
| 리뷰어 CLI 실패 (exit ≠ 0) | 1회 재시도 → 여전히 실패면 **결측 처리**하고 남은 인원으로 라운드 진행 |
| 리뷰어 타임아웃 (300s 초과) | 1회 재시도 → 여전히 초과면 결측 처리 |
| 리뷰어 JSON 스키마 불일치 | 1회 재시도(스키마 위반 지점을 프롬프트에 명시) → 여전히 불일치면 결측 처리 |
| **리뷰어 2명 이상 결측** | 라운드 중단. 1인 의견으로는 합의 과정이 성립하지 않음 |
| 심판 실패/타임아웃 | 재시도 → 실패 시 **다음 로테이션 모델로 대체** → 그래도 실패면 세션 중단 |
| `anon/round-N.json` 에 벤더 지문 검출 | **즉시 중단**. 복구 대상이 아님 — §12 검증 실패는 신뢰 경계 붕괴이므로 재시도로 덮지 않음 |

`agy` 의 `--print-timeout` 기본값이 5m이므로 리뷰어 타임아웃 300s와 정합합니다. `omx` / `claude -p` 는 별도 타임아웃 옵션이 없으므로 셸 레벨에서 감쌉니다 — macOS에는 GNU `timeout` 이 없으므로 `gtimeout`(coreutils) 가용성을 사전 확인하고, 없으면 백그라운드 실행 + `wait` 조합으로 처리합니다(R005 플랫폼 도구 변형).

### 결측과 익명성

리뷰어가 결측되어도 익명성은 유지됩니다. 셔플 때문에 "어느 라벨이 빠졌는가"가 "어느 벤더가 빠졌는가"로 이어지지 않기 때문입니다. 결측 시 `map` 에서 해당 라벨이 제외되며 `anon/round-N.json` 의 `reviewers[]` 항목 수가 줄어듭니다.

다만 **심판에게 참여 인원수는 고지합니다**. 심판이 3인을 전제하고 "C가 침묵했다"를 유의미한 신호로 해석하면 오판이 발생하므로, 번들 프롬프트에 "이번 라운드 참여 인원: 2인"을 명시합니다. 인원수만 알리고 어느 벤더가 빠졌는지는 알리지 않습니다.

### 비용 통제

| 항목 | 값 / 방침 |
|------|-----------|
| 라운드당 토큰 추정 | **60~120k** (실측 기준: `omx exec` 프로브 1회 18.6k 토큰 × 리뷰어 3 + 심판 1, 첨부 문서 크기에 따라 변동) |
| `prior_rounds` 범위 | **직전 2라운드만** 전달. 전체 누적 전달은 라운드 수에 대해 비용이 2차로 증가하므로 평탄화 |
| 누적 토큰 표시 | 매 게이트에 `누적 토큰: {합계} ({라운드별 내역})` 를 표시하여 사용자가 중단 시점을 판단할 수 있게 함 |
| 기본 상한 | `max_rounds: 5` → 최악의 경우 약 600k 토큰 |

`prior_rounds` 를 2라운드로 자르면 R4 이후 심판은 R1의 원 지적을 직접 보지 못합니다. 이 손실은 심판의 `draft` 가 매 라운드 누적 결론을 담고 있어 부분적으로 보상됩니다 — 초안이 사실상 압축된 세션 기억 역할을 합니다.

---

## 12. R010 위임 구조와 검증

### 위임 구조

오케스트레이터(메인 대화)는 파일을 생성·수정할 수 없습니다(R010). `agora` 는 라운드마다 다수의 아티팩트 파일을 씁니다. 따라서:

```
오케스트레이터
  ├─ 라운드 N 실행을 Agent(agora-runner) 에 위임
  │    └─ agora-runner: scripts/ 실행 → 아티팩트 기록 → verdict 요약만 반환
  ├─ 반환된 요약으로 사용자 게이트 표시 (오케스트레이터만 처리)
  └─ 사용자 선택 → 라운드 N+1 위임 또는 report.md 생성 위임
```

| 항목 | 내용 |
|------|------|
| 전용 에이전트 | `agora-runner` — 신규 생성 필요. **`mgr-creator` 로 생성**합니다 (R010 Protected Paths: `.claude/agents/*.md`) |
| 필요 도구 | `Bash`(스크립트 실행), `Write`/`Read`(아티팩트), `Glob` |
| 반환 계약 | **verdict 요약만** 반환합니다. 리뷰어 원문 없음, 벤더 출처 없음, `SEALED/` 경로 없음 |
| 게이트 처리 | 오케스트레이터 전담. 서브에이전트는 사용자와 상호작용하지 않음 |
| 위임 단위 | **라운드 1개 = 위임 1건**. 다중 라운드를 한 에이전트에 위임하지 않습니다 (R020 「위임 경계를 Phase 개수로 설계」 — Phase 경계가 곧 mid-step 종료 지점) |

`agora-runner` 의 반환이 verdict 요약으로 한정되는 것은 익명 경계의 마지막 방어선입니다. 원문을 반환하면 오케스트레이터 컨텍스트에 벤더 지문이 유입되어 이후 게이트 표시나 보고서 작성에 편향이 스며들 수 있습니다.

### 검증 (R023 Tier-1, 결정론적)

`bun test` 에 아래 테스트를 추가합니다. 세 가지 모두 LLM 없이 결정론적으로 판정 가능합니다.

**(1) 벤더 지문 부재 검사** — 핵심 안전 테스트

`anon/round-N.json` 전문(직렬화된 문자열)에 대해 아래 금칙 패턴이 **하나도 없어야** 합니다.

| 범주 | 패턴 예 |
|------|---------|
| CLI 이름 | `codex`, `omx`, `agy`, `gemini`, `claude -p`, `antigravity` |
| 모델명 | `opus`, `sonnet`, `gemini-3`, `gpt-oss`, `claude-`, `flash` |
| 경로 | `SEALED`, `mapping`, `raw/` |

대소문자 무시로 검사하며, 검출 시 테스트 실패 + §11에 따라 세션 즉시 중단입니다. 픽스처는 실제 벤더 응답을 모사한 정적 JSON을 사용하며 CLI 호출을 요구하지 않습니다.

**(2) 라벨 분포 균등성**

동일 시드 계열로 셔플을 N회(예: 3000회) 반복했을 때 각 벤더가 각 라벨을 받는 빈도가 균등 범위 안에 있는지 검사합니다. 특정 벤더가 특정 라벨에 편중되면 심판이 라벨 위치만으로 벤더를 추론할 수 있게 되므로, 이는 익명성의 통계적 전제 검증입니다.

**(3) 셔플 재현성**

같은 `seed` 로 `anonymize.sh` 의 셔플 함수를 두 번 호출했을 때 동일한 `map` 이 나오는지 검사합니다. §7의 감사 가능성 주장이 실제로 성립하는지 확인하는 테스트입니다.

**(4) 종료 판정 순수 함수**

§9의 판정 함수에 4종 종료 조건 각각과 `CONTINUE` 케이스의 `state.json` 픽스처를 주입해 기대 코드가 나오는지 검사합니다. 특히 `UNANIMOUS` + `REDESIGN` 이 `CONTINUE` 로 판정되는지(합의 종료가 아님) 확인하는 케이스를 포함합니다.

### 기타 정합 사항

- 스크립트 파일은 `.gitignore:43` 의 `!.claude/skills/` 화이트리스트 덕분에 git tracked 됩니다. 선례는 `.claude/skills/systematic-debugging/find-polluter.sh` 이며, `agora` 가 스크립트 보유 스킬 2번째가 됩니다.
- 스킬 신규 추가이므로 R017 카운트 동기화(스킬 114 → 115) 및 R022 위키 동기화가 필요합니다. 본 문서는 설계서이므로 카운트 파일을 변경하지 않으며, 구현 단계에서 처리합니다.
- `context: fork` 는 사용하지 않습니다. `agora` 는 다중 에이전트 오케스트레이션 스킬이 아니라 CLI 파이프라인 스킬이며, fork 상한(12, 현재 10 사용)을 소비할 이유가 없습니다.

---

## 미결 사항

없음. §2의 8개 요구사항과 §4~§12의 스키마·절차는 모두 확정되었으며, 구현 단계에서 새로운 설계 판단을 요구하는 항목은 남아 있지 않습니다.

구현 시 처리해야 할 실행 항목(설계 판단이 아닌 작업)은 다음과 같습니다: `mgr-creator` 를 통한 `agora-runner` 에이전트 및 `agora` 스킬 생성, `bun test` 4종 추가, 스킬 카운트 동기화(114 → 115), 위키 페이지 생성.
