# Harness Engineering

> Deep Insight 3부작 교훈을 oh-my-customcode 컴파일레이션 메타포와 정렬한 내재화 가이드
> 출처 내재화: #973 (Part 1), #974 (Part 2), #976 (Part 3)

## 목적

하네스 엔지니어링은 **에이전트의 행동 제어 + 인프라 격리**를 설계 1급 시민으로 끌어올리는 실천입니다. 단순 프롬프트 튜닝을 넘어, 에이전트가 (1) 자신의 능력을 선언하고 (2) 검증 가능한 경계 내에서 실행하며 (3) 상호 핸드오프할 수 있도록 하는 구조적 규율입니다.

oh-my-customcode는 이미 이 규율의 핵심 자산을 보유하고 있습니다. 본 가이드는 새 프리미티브를 도입하는 것이 아니라, 기존 에이전트·스킬·규칙이 하네스 엔지니어링이라는 공통 언어로 어떻게 연결되는지를 명문화합니다.

---

## 1. 3-Layer Hierarchy (Part 1 내재화)

### 프로덕션 Multi-Agent 시스템의 5가지 반복 문제

외부 연구(Deep Insight #973)에서 추출한 패턴을 oh-my-customcode 맥락으로 재해석합니다.

| # | 문제 | oh-my-customcode 매핑 |
|---|------|----------------------|
| 1 | **오케스트레이터 오염** — 조율자가 직접 작업을 실행해 단일 책임 원칙 붕괴 | R010: 오케스트레이터는 파일 수정 금지. 서브에이전트에 위임 |
| 2 | **컨텍스트 압축 시 규칙 망각** — 컨텍스트 창 한계에서 MUST 규칙이 증발 | PostCompact hook이 R007/R008/R009/R010/R018을 재주입 |
| 3 | **비구조적 병렬 실행** — 독립 작업을 순차 실행해 지연 누적 | R009: 2+ 독립 태스크는 반드시 병렬. 최대 5 동시 인스턴스 |
| 4 | **핸드오프 불투명** — 에이전트 간 결과 전달 경로 불명확 | R015: 라우팅 의도 투명화. `[Intent Detected]` 형식 표시 |
| 5 | **능력 초과 행동** — 에이전트가 선언된 도구 범위 밖을 실행 | action-validator 스킬이 프리-플라이트 경계 검사 담당 |

### Coordinator / Planner / Supervisor / Executor 계층

Deep Insight가 제안하는 4계층 구조는 oh-my-customcode에 이미 구현되어 있습니다.

| 역할 | oh-my-customcode 매핑 | 핵심 책임 |
|------|----------------------|----------|
| **Coordinator** | 메인 대화 + routing skills | 요청 수신 → 에이전트 라우팅 → 결과 집약. R010에 따라 파일 수정 금지 |
| **Planner** | `deep-plan`, `release-plan`, `sdd-dev` | 작업 분해 → 의존성 분석 → 실행 순서 계획 |
| **Supervisor** | `mgr-sauron` (R017 검증) | 구조 정합성 검증. 커밋/푸시 전 필수 통과 관문 |
| **Executor** | 전문가 에이전트 (`lang-*`, `be-*`, `fe-*`, `infra-*` 등) | 단일 도메인 실행. 선언된 `tools` 프리미티브만 사용 |

계층 위반의 대표 패턴과 교정:

```
# 위반: Coordinator가 직접 파일 수정
메인 대화 → Write(".claude/agents/new.md", content)  ← R010 위반

# 교정: Executor에게 위임
메인 대화 → Agent(mgr-creator, mode: "bypassPermissions") → Write(".claude/agents/new.md", content)
```

### Tracker 체크포인트 패턴 (v0.106.0+ 이관)

현재 파이프라인 상태 추적은 `/tmp/.claude-pipeline-{PID}.json` 파일과 `.claude/outputs/sessions/{YYYY-MM-DD}/` 아티팩트 규약으로 구현되어 있습니다. 전용 Tracker 에이전트(dag-orchestration / pipeline-guards 통합형)는 `context: fork` cap 확장 이후 후속 릴리즈로 이관합니다.

---

## 2. Context Engineering (Part 2 내재화)

### Context Window 한계 극복 원칙

| 원칙 | 설명 | oh-my-customcode 구현 |
|------|------|----------------------|
| **Per-agent budget allocation** | 태스크 유형별 컨텍스트 예산 분리 | R013 task-type-aware thresholds (research 40% / impl 50% / review 60% / management 70%) |
| **Artifact handoff over inline transfer** | 대용량 결과는 메모리 전달 대신 파일 아티팩트로 핸드오프 | R006 Artifact Output Convention: `.claude/outputs/sessions/{날짜}/` |
| **Result aggregation as compression** | 하위 에이전트 결과를 집약·압축해 상위 컨텍스트에 전달 | `result-aggregation` 스킬, R013 ecomode `[Batch Complete]` 형식 |
| **PostCompact rule re-injection** | 컨텍스트 압축 후 핵심 규칙 재주입 | R021 PostCompact hook → R007/R008/R009/R010/R018 재로드 |

### oh-my-customcode 구현 현황

| 기법 | 현재 위치 | Deep Insight 보강 포인트 |
|------|----------|------------------------|
| Task-type budget | R013 SHOULD-ecomode.md | Per-agent dimension 추가 — 동일 태스크라도 에이전트 모델(haiku vs opus)에 따라 예산 차등 적용 검토 |
| Artifact transfer | R006 Artifact Output Convention | "Channel Protocol" 용어 명문화 — 스킬 간 핸드오프 규약 표준화 |
| Compression | `result-aggregation` + ecomode `concise` 출력 스타일 | Channel read pattern 추가 — 아티팩트 파일을 직접 읽는 패턴과 집약된 요약만 수신하는 패턴 구분 |
| Compaction guard | PostCompact hook (SessionStart fallback) | 컴팩션 감지 시 즉시 MEMORY.md 로드 + 규칙 재활성화 |

---

## 3. Harness Engineering (Part 3 내재화)

### 행동 제어 (Behavior Control)

에이전트가 **선언된 능력의 경계 내에서만 동작하도록 강제하는 메커니즘**입니다.

| 레이어 | 구현체 | 작동 방식 |
|--------|--------|----------|
| 선언적 경계 | R006 agent frontmatter `tools`, `domain`, `limitations` | 에이전트 정의 시점에 허용 도구 범위를 명시 |
| 사전 검증 | `action-validator` 스킬 | 도구 호출 전 선언 범위 대비 일탈 경고 (advisory) |
| 합성 하네스 | `harness-synthesizer` 스킬 | YAML 검증 규칙 자동 생성 → action-validator 코드-검증 모드로 연동 |
| 정책 캐시 | `action-validator` Policy Cache Pattern | 반복 워크플로우(mgr-gitnerd git-commit 등)의 검증 결정을 재사용 |

**Enforcement 수준 선택 기준** (R021 advisory-first 원칙 준수):

```
기본: advisory (verifier 모드) — 경고만, 실행 차단 없음
opt-in: hard-enforce (filter 모드, --hard-enforce 플래그) — 명시적 사용자 동의 후만
```

### 인프라 격리 (Infrastructure Isolation)

에이전트 실행 환경을 프로젝트 기본값으로부터 격리해 사이드 이펙트를 방지합니다.

| 격리 수준 | 프리미티브 | 활성화 방법 |
|----------|-----------|-----------|
| **Git worktree** | R006 `isolation: worktree` | 별도 브랜치에서 에이전트 실행 → 메인 브랜치 오염 방지 |
| **Sandbox** | R006 `isolation: sandbox` + `sandboxFailIfUnavailable: true` | restricted bash 환경에서 실행 |
| **Tool tier 제한** | R002 Permission Tiers (Tier 1-6) | `disallowedTools` 프리미티브로 티어별 도구 차단 |
| **Sensitive path guard** | CC sensitive path 처리 | `.claude/` 하위 Bash 사용 시 Write/Edit 도구로 우회 (#960, #961) |

### 언어적 명문화 vs 신규 도입

본 가이드는 **신규 프리미티브 도입이 아니라 기존 자산의 언어적 승격**입니다. R006의 `isolation`, R021 advisory enforcement, `.claude/outputs/` 아티팩트 규약은 모두 하네스 엔지니어링의 실체입니다. "Harness Engineering"이라는 용어로 이들을 통합 지칭하는 것이 이 가이드의 기여입니다.

---

## 4. oh-my-customcode 하네스 스킬 매핑

| 스킬 | 하네스 차원 | 주요 책임 |
|------|-----------|----------|
| `harness-synthesizer` | 합성 | AutoHarness-inspired verifier/filter/policy YAML 하네스 자동 생성. 결과물: `.claude/outputs/harnesses/{agent}-{mode}.yaml` |
| `action-validator` | 사전 검증 | 도구 호출 전 선언 범위 확인. Policy Cache로 반복 워크플로우 검증 재사용. Capability Hints (Opus 4.7+) 지원 |
| `adaptive-harness` | 진화 | 프로젝트 프로파일(`.claude/project-profile.yaml`) 학습. `--learn`으로 실패 패턴 추출 → R016 연동 |
| `harness-eval` | 평가 | 15개 SE 벤치마크 기반 에이전트 품질 점수화. 기준선: 49.5 → 79.3점 (60% 개선) |

### 관련 조율/라우팅 스킬

| 스킬 | 연관성 |
|------|--------|
| `dag-orchestration` | Coordinator 계층의 DAG 실행 흐름 제어 |
| `worker-reviewer-pipeline` | Worker/Reviewer 역할 분리로 Supervisor 패턴 구현 |
| `evaluator-optimizer` | harness-eval 루브릭을 입력으로 반복 최적화 루프 실행 |
| `pipeline-guards` | action-validator 하네스 체크를 파이프라인 품질 게이트로 연동 |

### 스킬 간 통합 흐름

```
/harness-synthesizer --agent {name} --mode verifier
  → .claude/outputs/harnesses/{name}-verifier.yaml 생성
  → action-validator code-verified 모드로 로드
  → pipeline-guards 품질 게이트로 참조
  → evaluator-optimizer sprint contract 기준으로 활용
```

```
/omcustom:adaptive-harness --learn
  → .claude/outputs/ + .claude/agent-memory/ 분석
  → 실패 패턴 발견 → R016 규칙 업데이트 권고
  → harness-synthesizer 트리거 (패턴별 하네스 재합성)
```

---

## 5. 교차 참조

### 내부 가이드

| 가이드 | 연관성 |
|--------|--------|
| `guides/multi-provider-exec/` | OpenHarness의 provider profile switching 패턴 채용. 멀티 프로바이더 실행 시 각 프로바이더별 하네스 고려 |
| `guides/multi-model-routing/` | Claude 모델 선택 전략. 하네스 비용-품질 트레이드오프(haiku 검증 vs opus 실행)와 연결 |
| `guides/skill-bundle-design/` | Author/Test/Troubleshoot tri-pattern이 하네스 Verifier/Filter/Policy 3-mode와 구조적으로 대응 |
| `guides/worktree-lifecycle/` | Git worktree 격리 패턴. R006 `isolation: worktree` 실제 운영 참조 |

### 규칙

| 규칙 | 연관 포인트 |
|------|-----------|
| R002 (Permission Tiers) | Tier 1-6 도구 분류가 action-validator의 파일 범위 검사 기반 |
| R005 (Capability-aware Tool Scheduling) | ouroboros PR #353 capability graph 패턴. action-validator Capability Hints와 직접 연동 |
| R006 (Agent Design) | `tools`, `domain`, `limitations`, `isolation` 필드가 하네스 행동 제어의 선언 계층 |
| R009 (Parallel Execution) | Executor 병렬화 원칙. adaptive-harness `--scan`의 병렬 Glob/Grep 호출 근거 |
| R010 (Orchestrator Coordination) | Coordinator 계층의 파일 수정 금지 + Universal bypassPermissions 강제 |
| R013 (Ecomode) | Context budget thresholds가 Context Engineering 섹션의 per-agent 예산 할당 기반 |
| R017 (Sync Verification) | mgr-sauron이 Supervisor 계층 역할. 하네스 구조 변경 후 R017 검증 필수 |
| R018 (Agent Teams) | 3+ 에이전트 또는 review cycle → Agent Teams. 하네스 설계 검토에도 적용 |
| R021 (Enforcement Policy) | Advisory-first 모델. 하네스 hard-enforce는 명시적 opt-in만 허용 |

### 스킬

`token-efficiency-audit` — 하네스 컨텍스트 예산 감사에 활용. 스킬 실행 비용 최적화.

---

## 6. Deferred (v0.106.0+)

향후 릴리즈로 이관된 항목들입니다. 현재 구조가 안정화된 후 순차 구현합니다.

| 항목 | 이관 이유 | 예상 릴리즈 |
|------|----------|-----------|
| **Tracker 체크포인트 에이전트** — dag-orchestration / pipeline-guards 통합형 전용 Tracker | `context: fork` cap(현재 12/12) 확장 필요 | v0.106.0+ |
| **hierarchical-agent-topology 스킬** — 4계층 구조를 자동 검증하는 전용 스킬 | fork 스킬 cap 해소 후 추가 | v0.106.0+ |
| **sdd-dev Harness Decision Record 템플릿** — 하네스 설계 결정을 ADR 형식으로 기록 | sdd-dev 스킬 업데이트와 병행 | v0.107.0+ |
| **harness-synthesizer 2단계 격리 구현 예시** — Base64 인코딩 + subprocess 격리의 실제 YAML 예시 | 보안 리뷰 후 추가 | v0.107.0+ |

---

## 참고

이 가이드는 Deep Insight 시리즈 (#973/#974/#976) 내재화 결과입니다. 원본 외부 자료 링크는 각 이슈 본문을 참조하세요.

구현된 스킬 파일 위치:
- `.claude/skills/harness-synthesizer/SKILL.md`
- `.claude/skills/action-validator/SKILL.md`
- `.claude/skills/adaptive-harness/SKILL.md`
- `.claude/skills/harness-eval/SKILL.md`
