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

### Tracker 체크포인트 패턴

현재 파이프라인 상태 추적은 `/tmp/.claude-pipeline-{PID}.json` 파일과 `.claude/outputs/sessions/{YYYY-MM-DD}/` 아티팩트 규약으로 구현되어 있습니다. ✅ 구현 완료 (v0.106.1 via #983 — `.claude/agents/tracker-checkpoint.md`): 전용 Tracker 에이전트(dag-orchestration / pipeline-guards 통합형)가 배포되어 checkpoint persistence, resume-after-failure, gate state 기록을 담당합니다.

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
| **Tracker 체크포인트 에이전트** — dag-orchestration / pipeline-guards 통합형 전용 Tracker | ✅ 구현 완료 (v0.106.1 via #983 — `.claude/agents/tracker-checkpoint.md`) | — |
| **hierarchical-agent-topology 스킬** — 4계층 구조를 자동 검증하는 전용 스킬 | fork 스킬 cap 해소 후 추가 | v0.106.0+ |
| **sdd-dev Harness Decision Record 템플릿** — 하네스 설계 결정을 ADR 형식으로 기록 | sdd-dev 스킬 업데이트와 병행 | v0.107.0+ |
| **harness-synthesizer 2단계 격리 구현 예시** — Base64 인코딩 + subprocess 격리의 실제 YAML 예시 | 보안 리뷰 후 추가 | v0.107.0+ |

---

## 7. Doom Loop 탐지 / Pre-completion Checklist (#1021 내재화)

> 출처: LangChain "Improving Deep Agents with Harness Engineering" — deepagents-cli가 Terminal Bench 2.0에서 52.8% → 66.5%를 달성한 핵심 패턴.

### Build-Verify 루프

"단계마다 자체 검증"은 단순한 QA 게이트가 아닙니다. 에이전트가 다음 단계로 진행하기 전 현재 상태가 기대값과 일치하는지 **구조적으로 확인**하는 루틴입니다.

oh-my-customcode 매핑:

| 패턴 | 구현체 |
|------|--------|
| 단계별 자체 검증 | `pipeline-guards` 스킬의 품질 게이트 + R020 완료 검증 매트릭스 |
| 검증 실패 시 중단 | `deep-verify` 스킬의 다각도 검증 → 회귀 차단 |
| 결과 기록 | tracker-checkpoint 에이전트의 `/tmp/.claude-pipeline-{PPID}.json` checkpoint |

### Doom Loop 탐지

**동일 실패를 3회 이상 반복하는 "Doom Loop"**는 에이전트 자율 실행 품질의 최대 위협 중 하나입니다. LangChain은 동일 동작 감지 → break-out 메커니즘을 핵심 하네스 컴포넌트로 지정했습니다.

oh-my-customcode에서의 현황:

- `stuck-recovery` 스킬이 부분 내재화 — 단발성 행착 상황에서 대안 경로 제시
- **갭**: same-action 3회 감지 + 자동 에스컬레이션 로직 부재

권장 보강 방향 (`stuck-recovery` 스킬):

```
# 감지 조건 (pseudo-pattern)
이전 3 액션이 동일한 도구·파라미터 패턴 → doom-loop 판정

# Break-out 시퀀스
1. 현재 상태를 tracker-checkpoint에 기록
2. [Warning] Doom loop detected — {action} × {n}회 반복
3. 에스컬레이션: haiku → sonnet → opus 순서로 모델 전환
4. 메모리 저장: feedback_doom_loop_{날짜}.md → 세션 간 패턴 누적
```

크로스-세션 패턴 감지에는 `adaptive-harness --learn` + claude-mem MCP를 연동해 동일 실패 패턴이 반복 보고되는 에이전트를 자동 플래그합니다.

### Pre-completion Checklist

LangChain deepagents-cli는 [Done] 선언 전 명시적 체크리스트 실행을 필수화합니다. oh-my-customcode의 R020 완료 검증 매트릭스와 정합하지만, **표준화된 체크리스트 형식**은 아직 별도 문서화되어 있지 않습니다.

권장 형식 (R020 `Completion Contract Format` 확장안):

```
[Pre-completion Checklist]
□ 실제 결과 확인 (명령 실행 ≠ 성공)
□ 태스크 유형별 기준 충족 (R020 매트릭스)
□ 사이드 이펙트 없음 (타 에이전트 범위 미침범)
□ Doom loop 미발생 (동일 액션 3회 미만)
□ 아티팩트 핸드오프 완료 (필요 시)
→ 전항 체크 완료 후 [Done] 선언
```

> R020에 pre-completion checklist 표준 형식 추가는 별도 followup 이슈(#1036+)로 관리를 권장합니다.

### Local Context Auto-discovery

deepagents-cli는 README / CONTRIBUTING.md / .cursorrules를 자동 로드합니다. 이는 oh-my-customcode의 **CLAUDE.md auto-injection 패턴**과 구조적으로 동형입니다.

| LangChain | oh-my-customcode |
|-----------|-----------------|
| README / CONTRIBUTING 자동 로드 | CLAUDE.md 자동 주입 (시스템 프롬프트 선두) |
| .cursorrules 프로젝트 지시어 | `.claude/rules/*.md` 전역 규칙 |
| Per-run 컨텍스트 디스커버리 | `paths:` 필드로 조건부 스킬 자동 주입 |

---

## 8. Eval Hill-Climbing 6단계 워크플로우 (#1024 내재화)

> 출처: LangChain "Better Harness — A Recipe for Harness Hill-climbing with Evals"

"Eval을 ML 훈련 데이터처럼 취급하라"는 핵심 통찰에서 출발하는 6단계 레시피입니다.

### 6단계 레시피와 oh-my-customcode 매핑

| # | LangChain 단계 | 설명 | oh-my-customcode 대응 |
|---|--------------|------|----------------------|
| 1 | **Source/tag evals** | eval 데이터를 수집·레이블링. 태그로 분류 | `harness-eval` — 15개 SE 벤치마크 + `agent-eval-framework` 4-metric ideal trajectory |
| 2 | **Optimization/Holdout split** | 보통 80/20으로 분할 — holdout은 일반화 프록시 | **(갭)** 현재 분할 메커니즘 미구현 |
| 3 | **Baseline** | 현재 하네스의 측정값 기록 | `omcustom-improve-report` 정량 데이터 수집 |
| 4 | **Optimize** | 진단 → 가설 → 실험 → 검증 반복 | `adaptive-harness --learn` 패턴 |
| 5 | **Validate** | holdout 통과 필수 — 회귀 차단 | `deep-verify` 다각도 검증 |
| 6 | **Human review** | 최종 sanity check | `mgr-sauron` R017 검증 |

### 핵심 통찰

**"Quality > Quantity"**: eval 케이스 수보다 케이스의 명확성·대표성이 중요합니다. `harness-eval`의 15개 벤치마크는 이 원칙의 반영입니다 — 수백 개 케이스보다 정밀하게 선별된 소수가 유의미한 개선 신호를 제공합니다.

**"통과한 evals = 회귀 테스트"**: 한번 통과한 eval 케이스는 변경 불가 지식으로 보존해야 합니다. 새 하네스 버전이 기존 통과 케이스를 실패시키면 퇴행으로 판정합니다.

**"Spring cleaning"**: 포화(saturated)되거나 폐기된(obsolete) 케이스는 정기적으로 제거합니다. 오래된 케이스 누적은 eval 집합을 노이즈화하고 개선 신호를 희석합니다.

**"Holdout = 일반화 프록시"**: Optimization split으로 개선하더라도 holdout pass 없이는 배포 금지. `deep-verify`의 다각도 검증이 이 역할을 부분 수행합니다.

### 식별된 갭

**Eval data governance** — 태깅·분할·spring-cleaning을 담당하는 메커니즘이 현재 부재합니다.

| 갭 | 현황 | 권장 방향 |
|----|------|----------|
| Optimization/Holdout split | 미구현 | `eval-core` schema에 `split: optimization|holdout` metadata column 추가 |
| Pass-as-regression-test | 미구현 | 통과 eval을 자동으로 `.claude/outputs/eval-regressions/`에 보존하는 로직 |
| Spring cleaning | 미구현 | `harness-eval --spring-clean` 플래그로 saturated/obsolete 케이스 감지 |

> 이 갭들은 #1036 별도 이슈로 추적을 권장합니다 (eval-core schema 확장).

### Optimize 단계 세부 패턴

LangChain이 권장하는 반복 주기: **진단 → 가설 → 실험 → 검증**

oh-my-customcode 내에서 이 주기는 다음으로 구현됩니다:

```
1. 진단: harness-eval → 점수 하락 벤치마크 식별
2. 가설: adaptive-harness --learn → 실패 패턴 → 원인 후보 제시
3. 실험: harness-synthesizer → 새 verifier YAML 합성 → 적용
4. 검증: deep-verify → holdout 역할로 회귀 차단
```

---

## 9. Agent Harness 6 컴포넌트 해부학 (#1026 내재화)

> 출처: LangChain "The Anatomy of an Agent Harness"
> 핵심 명제: **Agent = Model + Harness**

모델이 "무엇을 할 수 있는가"를 결정한다면, 하네스는 "어떻게, 어디서, 얼마나 실행하는가"를 결정합니다. 하네스 없이 모델 단독으로는 프로덕션 수준의 신뢰성을 달성할 수 없습니다.

### 6 컴포넌트와 oh-my-customcode 매핑

| # | 컴포넌트 | LangChain 정의 | oh-my-customcode 구현 | 상태 |
|---|---------|--------------|----------------------|------|
| 1 | **Filesystems** | 파일 읽기/쓰기/탐색 도구 | Read / Write / Edit / Glob / Grep | ✅ 완비 |
| 2 | **Bash/Code Execution** | 코드 실행 + 에이전트 격리 | Bash 도구 + agent isolation (`isolation: worktree\|sandbox`) | ✅ 완비 |
| 3 | **Sandboxes** | 실행 환경 격리 | R006 `isolation: worktree \| sandbox` + `sandboxFailIfUnavailable: true` | ✅ 완비 |
| 4 | **Memory & Search** | 세션 간 지식 유지 + 검색 | claude-mem MCP + episodic-memory + `.claude/agent-memory/` (R011) | ✅ 완비 |
| 5 | **Context Management** | 컨텍스트 예산 관리 + 압축 | R013 ecomode + auto-injection + Deep Insight Context Handoff Pattern | ✅ 완비 |
| 6 | **Long-Horizon Execution** | 장기 실행 + 복수 에이전트 조율 | Agent Teams + `worker-reviewer-pipeline` + `omcustom-loop` SubagentStop hook | ✅ 완비 |

5개 컴포넌트는 완전히 매핑되며, 1개의 갭이 식별됩니다.

### 핵심 설계 원칙

**Working Backward Method**: 원하는 에이전트 행동에서 거꾸로 하네스를 설계합니다. "에이전트가 이 단계에서 X를 해야 한다"라는 요구사항에서 시작해, 그 행동을 가능하게 하는 하네스 컴포넌트를 역방향으로 도출합니다.

이는 oh-my-customcode의 **mgr-creator dynamic agent creation 철학**과 구조적으로 동형입니다: 작업이 먼저 정의되고, 필요한 전문가 에이전트(하네스 포함)가 그 다음에 생성됩니다.

**Context as Scarce Resource**: 하네스의 역할은 모델에게 필요한 정보를 정확한 시점에, 최소한의 토큰으로 전달하는 것입니다. 모든 스킬 메타데이터를 매 세션에 주입하는 방식은 이 원칙에 반합니다.

- R013 ecomode: 컨텍스트 예산 임계값으로 과잉 주입 억제
- `paths:` 필드: 관련 파일이 열릴 때만 스킬 자동 주입 (조건부 lazy-load 부분 구현)
- Deep Insight Context Handoff Pattern: 에이전트 간 대용량 결과를 아티팩트 파일로 전달, 인라인 전달 금지

**Model-Harness 공진화**: 모델이 업그레이드되면 하네스도 재최적화가 필요합니다. 새 모델이 이전 하네스의 제약을 우회하거나, 반대로 새 능력을 활용하지 못할 수 있습니다.

```
모델 업그레이드 시 권장 워크플로우:
1. adaptive-harness --learn → 기존 실패 패턴 재분석
2. harness-eval → 새 모델의 벤치마크 재측정
3. harness-synthesizer → 새 모델 특성에 맞게 하네스 재합성
4. deep-verify → 회귀 차단 검증
```

### 식별된 갭: Progressive Disclosure of Skills

현재 oh-my-customcode는 모든 스킬 메타데이터를 매 세션 컨텍스트에 주입합니다. LangChain의 권고는 **필요 시점까지 스킬 로딩을 지연(lazy-load)**하는 것입니다.

| 접근 방식 | 현황 | 토큰 영향 |
|----------|------|----------|
| 전체 주입 | CLAUDE.md + 모든 rules/ 자동 로드 | 고정 비용 (세션당 수천 토큰) |
| 조건부 주입 | `paths:` 필드로 부분 구현 | 파일 오픈 시점에만 주입 |
| 완전 lazy-load | 미구현 | 온-디맨드 → 최소 컨텍스트 |

권장 방향: 빈번히 사용되지 않는 스킬(package scope 등)을 `paths:` 조건부 로딩으로 전환합니다. `scope: package` 스킬은 이미 init 자동 배포 대상에서 제외되어 있어 부분적으로 이 원칙을 반영합니다.

### Long-Horizon Execution 심화

컴포넌트 6은 oh-my-customcode에서 가장 풍부하게 구현된 영역입니다.

```
단기 실행 (< 3분):      Agent Tool + R009 병렬 실행
중기 실행 (3-10분):     Agent Teams + shared task list (R018)
장기 실행 (> 10분):     omcustom-loop + SubagentStop hook + tracker-checkpoint
장기 + 재시작 필요:     /tmp/.claude-pipeline-{PPID}.json checkpoint → resume
```

---

## 참고

이 가이드는 Deep Insight 시리즈 (#973/#974/#976) 내재화 결과입니다. 원본 외부 자료 링크는 각 이슈 본문을 참조하세요.

구현된 스킬 파일 위치:
- `.claude/skills/harness-synthesizer/SKILL.md`
- `.claude/skills/action-validator/SKILL.md`
- `.claude/skills/adaptive-harness/SKILL.md`
- `.claude/skills/harness-eval/SKILL.md`
