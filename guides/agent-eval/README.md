# Agent Evaluation Framework Guide

> 출처: [LangChain — How We Build Evals for Deep Agents](https://www.langchain.com/blog/how-we-build-evals-for-deep-agents)
> 관련 이슈: #1025 | 관련 스킬: `agent-eval-framework`

---

## 1. 개요

### 방법론 배경

LangChain의 Deep Agents 평가 방법론은 "More evals ≠ better agents" 철학에서 출발한다. 평가 항목 수를 늘리는 것이 에이전트 품질을 보장하지 않는다는 실증적 관찰에 기반하며, 대신 **4개의 정량 지표**에 집중해 측정 부담을 줄이면서 신호 품질을 높이는 접근을 제안한다.

### 핵심 철학

| 관점 | 설명 |
|------|------|
| 정량 지표 | 재현 가능하고 자동화 가능한 측정 — correctness, step_ratio, tool_call_ratio, latency_ratio |
| 정성 평가 | 사람이 판단해야 하는 영역 — reasoning 품질, edge case 처리, 사용자 의도 해석 |
| 보완 관계 | 정량 지표가 필터링 역할, 정성 평가가 최종 품질 판단 |

정량 지표는 **게이트** 역할을 한다. correctness를 통과하지 못한 에이전트는 efficiency 측정 대상에서 제외하여 측정 자원을 절약한다.

### oh-my-customcode 맥락

oh-my-customcode의 에이전트 시스템은 49개 전문 에이전트와 114개 스킬로 구성된다. 이 방법론은 신규 에이전트 검증(mgr-creator), 릴리즈 품질 검증(deep-verify), 반복 개선 루프(evaluator-optimizer)에 정량 차원을 추가하는 수단으로 내재화된다.

---

## 2. 4-Metric Framework 측정 절차

### 2.1 correctness (정확도)

**정의**: 에이전트가 주어진 작업을 올바르게 완료했는가를 pass/fail로 판정한다.

**판정 기준**

```yaml
# 판정 예시
correctness:
  pass: true      # 작업 목표 완전 달성
  pass: false     # 작업 목표 미달성 또는 부분 달성
```

**Edge cases**

| 상황 | 처리 방법 |
|------|-----------|
| Partial pass | 하위 목표(sub-goal) 단위로 분해 후 각각 pass/fail — 전체 correctness는 `달성 sub-goal / 전체 sub-goal` |
| Flaky tests | 동일 조건에서 3회 반복 실행, 다수결(2/3 이상) 적용 |
| 비결정적 출력 | 출력 형식만 검증하는 structural correctness와 내용을 검증하는 semantic correctness로 분리 |
| Timeout | correctness=false 처리, latency_ratio 측정에서 제외 |

**측정 시점**: 작업 완료 후 최종 상태(파일, 출력, 부수효과)를 검증한다. 중간 과정이 아닌 **결과** 기준이다.

**oh-my-customcode 적용**

```yaml
# 예시: lang-golang-expert 검증
task: "src/parser.go에 JSON 파서 함수 추가"
correctness_check:
  - type: file_exists
    path: "src/parser.go"
  - type: function_exists
    name: "ParseJSON"
  - type: test_pass
    command: "go test ./..."
```

---

### 2.2 step_ratio (단계 효율성)

**정의**: 에이전트가 사용한 실제 단계 수와 ideal trajectory의 단계 수의 비율.

```
step_ratio = actual_steps / ideal_steps
```

- `step_ratio = 1.0`: 이상적 단계 수와 일치
- `step_ratio < 1.0`: 이상보다 적은 단계 (더 효율적이거나 단계를 건너뜀)
- `step_ratio > 1.0`: 이상보다 많은 단계 (비효율 또는 탐색)

**Step 정의**

step은 다음 단위로 카운트한다:

| 단위 | 카운트 여부 | 설명 |
|------|-------------|------|
| LLM turn (추론) | 예 | 모델이 응답을 생성하는 1회 호출 |
| Tool call | 예 | Read, Write, Bash 등 1회 도구 호출 |
| 병렬 tool call | 1로 카운트 | 동일 turn에서 동시 실행된 N개 호출 = 1 step |
| Retry (동일 도구) | 별도 카운트 | 실패 후 재시도는 추가 step |
| Agent spawn | 예 | 서브에이전트 호출 1회 = 1 step |

**측정 단위 주의사항**

oh-my-customcode의 R009(병렬 실행)에 의해 다수의 에이전트가 동시에 스폰될 수 있다. 병렬 스폰은 단일 step으로 카운트하여 병렬 실행을 패널티 없이 장려한다.

**측정 방법**

```python
# 의사코드 — 실제 구현은 agent-eval-framework 스킬 참조
def measure_step_ratio(trace: list[dict], ideal_steps: int) -> float:
    # parallel tool calls in same turn = 1 step
    actual_steps = count_turns(trace)
    return actual_steps / ideal_steps
```

---

### 2.3 tool_call_ratio (도구 호출 효율성)

**정의**: 에이전트가 실제로 한 tool call 수와 ideal trajectory의 tool call 수의 비율.

```
tool_call_ratio = actual_tool_calls / ideal_tool_calls
```

**동일 도구 반복 호출 처리**

```yaml
# 비효율 패턴 예시
actual_trace:
  - Read("src/main.go")    # step 1
  - Read("src/main.go")    # step 2 — 불필요한 재독
  - Write("src/main.go")   # step 3

# ideal trajectory
ideal_trace:
  - Read("src/main.go")    # step 1
  - Write("src/main.go")   # step 2

# tool_call_ratio = 3 / 2 = 1.5 (비효율)
```

동일 파일에 대한 반복 Read는 캐싱 실패 또는 컨텍스트 손실을 나타내므로 별도 카운트한다.

**병렬 호출 처리**

동일 turn에서 병렬로 실행된 tool call은 **개별적으로** 카운트한다. 병렬 Read(file-A) + Read(file-B)는 2 tool calls다. ideal trajectory에서도 병렬 호출로 설계한 경우 동일하게 2로 카운트한다.

```yaml
# 병렬 호출 예시
actual_trace:
  - parallel: [Read("a.go"), Read("b.go")]  # 2 tool calls, 1 step
  - Write("output.go")                       # 1 tool call, 1 step
# actual_tool_calls = 3
```

**임계값 가이드라인**

| tool_call_ratio | 해석 |
|-----------------|------|
| ≤ 1.0 | 이상적이거나 초과 효율 (단계 생략 가능성 — correctness 재확인) |
| 1.0 – 1.3 | 허용 범위 |
| 1.3 – 1.5 | 주의 — 반복 패턴 검토 필요 |
| > 1.5 | 비효율 — ideal trajectory 재검토 또는 에이전트 개선 필요 |

---

### 2.4 latency_ratio (지연 시간 효율성)

**정의**: 실제 완료 시간과 ideal trajectory 완료 시간의 비율.

```
latency_ratio = actual_latency_ms / ideal_latency_ms
```

**Cold start 보정**

에이전트 초기화, 모델 로딩, MCP 서버 연결 등의 cold start 시간은 작업 자체의 지연이 아니다. 보정 방법:

```yaml
# cold start 보정
raw_latency: 8500ms
cold_start_overhead: 1200ms  # 첫 연결 시 측정
adjusted_latency: 7300ms     # raw - overhead
```

warm 상태(이미 초기화된 세션)에서 측정한 latency를 기준으로 삼는다.

**Network jitter 보정**

WebFetch, MCP 서버 호출 등 외부 네트워크에 의존하는 step은 jitter 보정이 필요하다:

```yaml
# 3회 측정 후 중앙값 사용
measurements: [4200ms, 4800ms, 4150ms]
adjusted_latency: 4200ms  # 중앙값
```

단일 측정은 신뢰도가 낮다. 최소 3회 반복 후 중앙값을 사용한다.

**Ideal latency 산정**

ideal trajectory를 기준으로 각 step의 예상 소요 시간을 합산한다. 병렬 step은 최대 소요 시간만 카운트한다:

```yaml
ideal_trajectory:
  - step: Read("main.go")         # estimated: 100ms
  - step: parallel:               # estimated: max(150, 200) = 200ms
      - Write("output.go")        #   estimated: 150ms
      - Write("test.go")          #   estimated: 200ms
ideal_latency: 300ms  # 100 + 200
```

---

## 3. Ideal Trajectory 작성 가이드

### 3.1 Annotation YAML 스키마

`agent-eval-framework` 스킬에서 참조하는 annotation 파일의 스키마:

```yaml
# .claude/outputs/evals/{capability}/{task-id}.yaml
task_id: "file_ops_001"
capability: file_operations
description: "src/parser.go에 ParseJSON 함수 추가"
difficulty: medium   # easy | medium | hard | expert

ideal_trajectory:
  - step: 1
    type: tool_call
    tool: Read
    target: "src/parser.go"
    rationale: "기존 코드 구조 파악"
    estimated_ms: 150

  - step: 2
    type: tool_call
    tool: Edit
    target: "src/parser.go"
    rationale: "ParseJSON 함수 삽입"
    estimated_ms: 200

  - step: 3
    type: tool_call
    tool: Bash
    command: "go test ./..."
    rationale: "변경사항 검증"
    estimated_ms: 3000

metrics:
  ideal_steps: 3
  ideal_tool_calls: 3
  ideal_latency_ms: 3350

correctness_checks:
  - type: function_exists
    target: "src/parser.go"
    function: "ParseJSON"
  - type: test_pass
    command: "go test ./..."

tags:
  - file_operations
  - golang
  - add_function
```

**스키마 필드 설명**

| 필드 | 필수 | 설명 |
|------|------|------|
| `task_id` | 예 | 고유 식별자 (kebab-case 또는 underscore) |
| `capability` | 예 | 6개 capability 중 하나 (섹션 4 참조) |
| `difficulty` | 예 | 작업 난이도 — eval 세트 구성 시 다양도 유지 |
| `ideal_trajectory` | 예 | 순서대로 정의된 ideal step 목록 |
| `step.type` | 예 | `tool_call` \| `llm_turn` \| `agent_spawn` |
| `step.rationale` | 권장 | 해당 step이 필요한 이유 — annotation 검토 시 활용 |
| `step.estimated_ms` | 권장 | latency_ratio 산정 기준 |
| `correctness_checks` | 예 | 자동화 가능한 검증 조건 목록 |
| `tags` | 권장 | 검색 및 그룹화용 태그 |

---

### 3.2 작성 워크샵

#### 예시 1: file_operations — 파일 수정

**작업**: `src/config.go`에 새 환경변수 파싱 추가

```yaml
task_id: "file_ops_002"
capability: file_operations
description: "src/config.go에 DATABASE_POOL_SIZE 환경변수 파싱 추가"
difficulty: easy

ideal_trajectory:
  - step: 1
    type: tool_call
    tool: Read
    target: "src/config.go"
    rationale: "Config 구조체와 파싱 패턴 파악"
    estimated_ms: 120

  - step: 2
    type: tool_call
    tool: Edit
    target: "src/config.go"
    rationale: "DATABASE_POOL_SIZE 필드 및 파싱 로직 추가"
    estimated_ms: 180

metrics:
  ideal_steps: 2
  ideal_tool_calls: 2
  ideal_latency_ms: 300

correctness_checks:
  - type: grep
    target: "src/config.go"
    pattern: "DATABASE_POOL_SIZE"
  - type: compile
    command: "go build ./..."
```

#### 예시 2: retrieval — 코드베이스 탐색

**작업**: 프로젝트에서 deprecated API 사용 위치 전부 찾기

```yaml
task_id: "retrieval_001"
capability: retrieval
description: "codebase에서 `ioutil.ReadFile` deprecated 호출 전체 목록 반환"
difficulty: medium

ideal_trajectory:
  - step: 1
    type: tool_call
    tool: Grep
    target: "."
    pattern: "ioutil.ReadFile"
    rationale: "deprecated 호출 위치 일괄 검색"
    estimated_ms: 500

  # Glob으로 범위 좁히기 — 대형 프로젝트 한정
  # - step: 2
  #   type: tool_call
  #   tool: Glob
  #   pattern: "**/*.go"
  #   rationale: "Go 파일만 필터링"

metrics:
  ideal_steps: 1
  ideal_tool_calls: 1
  ideal_latency_ms: 500

correctness_checks:
  - type: output_contains
    expected_fields:
      - file_path
      - line_number
    check: all_occurrences_listed
```

#### 예시 3: tool_use — 복합 도구 활용

**작업**: 테스트 실패 진단 및 수정

```yaml
task_id: "tool_use_001"
capability: tool_use
description: "go test 실패 원인 진단 후 수정"
difficulty: hard

ideal_trajectory:
  - step: 1
    type: tool_call
    tool: Bash
    command: "go test ./... 2>&1"
    rationale: "실패 메시지 확인"
    estimated_ms: 5000

  - step: 2
    type: tool_call
    tool: Read
    target: "<실패한 테스트 파일>"
    rationale: "실패 컨텍스트 파악"
    estimated_ms: 150

  - step: 3
    type: tool_call
    tool: Edit
    target: "<소스 파일>"
    rationale: "버그 수정"
    estimated_ms: 200

  - step: 4
    type: tool_call
    tool: Bash
    command: "go test ./..."
    rationale: "수정 검증"
    estimated_ms: 5000

metrics:
  ideal_steps: 4
  ideal_tool_calls: 4
  ideal_latency_ms: 10350

correctness_checks:
  - type: test_pass
    command: "go test ./..."
```

---

### 3.3 Annotation 검증 체크리스트

작성된 ideal trajectory는 아래 항목으로 검증한다:

**실현 가능성 (Feasibility)**
- [ ] 모든 step이 실제로 실행 가능한가?
- [ ] 사용된 tool이 해당 에이전트의 허용 tool 목록에 있는가?
- [ ] 지정된 파일 경로가 실제로 존재하는가? (또는 task 설명과 일치하는가?)

**명확성 (Clarity)**
- [ ] 각 step의 `rationale`이 왜 그 step이 필요한지 설명하는가?
- [ ] `target`이 구체적으로 지정되어 있는가? (와일드카드 최소화)
- [ ] `correctness_checks`가 자동화 실행 가능한가?

**측정 가능성 (Measurability)**
- [ ] `ideal_steps`, `ideal_tool_calls`, `ideal_latency_ms`가 명시되어 있는가?
- [ ] `estimated_ms`의 합산이 `ideal_latency_ms`와 일치하는가? (병렬 step 보정 포함)
- [ ] `correctness_checks`가 pass/fail 이진 판정을 반환하는가?

---

### 3.4 Anti-patterns

**너무 엄격한 ideal trajectory**

```yaml
# 잘못된 예 — 파일 읽는 순서까지 고정
ideal_trajectory:
  - step: 1
    tool: Read
    target: "src/a.go"  # 반드시 a.go를 먼저 읽어야 함
  - step: 2
    tool: Read
    target: "src/b.go"  # 그 다음 b.go
```

파일 읽기 순서가 결과에 영향을 주지 않는다면 순서를 고정하지 말 것. 대신 `parallel:` 블록으로 순서 무관성을 표현한다.

**측정 불가 metric**

```yaml
# 잘못된 예
correctness_checks:
  - type: subjective
    check: "코드가 깔끔한가"  # 자동화 불가
```

주관적 판단은 correctness_check로 표현하지 않는다. 자동화 가능한 구조적 검증(compile, test_pass, grep, file_exists)으로 대체한다.

**Ambiguous step 정의**

```yaml
# 잘못된 예
- step: 2
  type: tool_call
  tool: Edit
  target: "src/"        # 디렉토리 — 어떤 파일?
  rationale: "필요한 곳 수정"  # 모호한 rationale
```

`target`은 파일 단위로 명시하고, `rationale`은 "왜 이 파일을 이 시점에 수정하는가"를 구체적으로 서술한다.

**Ideal trajectory과 correctness check 불일치**

```yaml
# 잘못된 예 — ideal은 Write를 사용하지만 check는 Edit 결과를 검증
ideal_trajectory:
  - tool: Write
    target: "output.json"
correctness_checks:
  - type: function_exists  # output.json에는 함수가 없음
```

correctness check는 실제 ideal trajectory의 예상 결과와 정확히 일치해야 한다.

---

## 4. Capability-Categorical Taxonomy 적용

### 4.1 6 Capabilities 상세 정의

LangChain Deep Agents 방법론은 에이전트 작업을 6개 capability로 분류한다:

| Capability | 정의 | 핵심 특성 |
|------------|------|-----------|
| `file_operations` | 파일/코드 읽기·쓰기·수정 | 파일시스템 상태 변경 |
| `retrieval` | 코드베이스·문서·인덱스 탐색 및 검색 | 읽기 전용, 정보 수집 |
| `tool_use` | 외부 도구·API·서비스 호출 | 외부 시스템과의 상호작용 |
| `memory` | 세션·장기 기억 저장·조회 | 상태 지속성 |
| `conversation` | 사용자 의도 파악 및 응답 생성 | 자연어 이해·생성 |
| `summarization` | 긴 컨텍스트 압축 및 요약 | 정보 밀도 최적화 |

### 4.2 oh-my-customcode 도구 매핑

각 capability에 대응하는 oh-my-customcode의 구체적 도구와 에이전트:

**file_operations**

| 도구/에이전트 | 역할 |
|---------------|------|
| `Write` | 신규 파일 생성 |
| `Edit` | 기존 파일 부분 수정 |
| `Read` | 파일 내용 읽기 |
| `lang-golang-expert`, `lang-python-expert`, ... | 언어별 파일 수정 전문가 |
| `mgr-creator` | agent/skill/guide 파일 생성 |

**retrieval**

| 도구/에이전트 | 역할 |
|---------------|------|
| `Grep` | 패턴 기반 코드 검색 |
| `Glob` | 파일 경로 패턴 탐색 |
| `Read` | 단일 파일 읽기 |
| `Bash` (grep, find) | 복합 검색 조건 |
| `hada-scout` 스킬 | URL 기반 외부 정보 검색 |

**tool_use**

| 도구/에이전트 | 역할 |
|---------------|------|
| `Bash` | CLI 도구 실행 (go test, npm, etc.) |
| `WebFetch` | HTTP 엔드포인트 호출 |
| `Agent` | 서브에이전트 스폰 (R010) |
| `de-airflow-expert`, `de-dbt-expert`, ... | 외부 플랫폼 전문 에이전트 |

**memory**

| 도구/에이전트 | 역할 |
|---------------|------|
| 네이티브 auto-memory | agent frontmatter `memory:` 필드 — MEMORY.md |
| `claude-mem` MCP | 크로스 세션 검색 (`save_memory`, `search_memory`) |
| `episodic-memory` MCP | 대화 자동 인덱싱 |
| `sys-memory-keeper` | 메모리 정리·업데이트 전담 에이전트 |

**conversation**

| 도구/에이전트 | 역할 |
|---------------|------|
| 메인 대화 (오케스트레이터) | 사용자 의도 파악·라우팅 |
| routing 스킬 (secretary/dev-lead/de-lead/qa-lead) | 도메인별 의도 분류 |
| `AskUserQuestion` | 명확화 질문 |

**summarization**

| 도구/에이전트 | 역할 |
|---------------|------|
| R013 Ecomode | 병렬 에이전트 결과 압축 |
| `result-aggregation` 스킬 | 다중 에이전트 결과 집계 |
| `omcustom-improve-report` 스킬 | 릴리즈 품질 리포트 생성 |

---

### 4.3 Cross-capability 작업 처리

실제 작업은 단일 capability로 분류되지 않는 경우가 많다. 이런 경우 **primary capability**로 분류하고 secondary를 태그로 병기한다:

**예시: 리팩토링 작업**

```yaml
task_id: "refactor_001"
capability: file_operations     # primary
description: "extractors.go 함수를 별도 패키지로 분리"
tags:
  - file_operations             # primary: 파일 생성·수정
  - retrieval                   # secondary: 기존 코드 탐색
  - tool_use                    # secondary: go test 실행
```

**분류 기준**: 가장 많은 ideal steps를 차지하는 capability를 primary로 선택한다.

**Cross-capability 가중치**

여러 capability에 걸친 작업은 각 capability별 부분 점수를 산출한 후 step 비율로 가중평균한다:

```
전체 score = Σ(capability_score_i × steps_in_capability_i) / total_steps
```

---

## 5. Tracing Infrastructure 대안

LangSmith 없이 oh-my-customcode 환경에서 에이전트 실행을 추적하는 방법.

### 5.1 대안 매핑 테이블

| LangChain 컴포넌트 | 역할 | oh-my-customcode 대안 |
|--------------------|----|----------------------|
| LangSmith trace | step별 실행 기록 수집 | claude-mem `save_memory` per step |
| Polly (record/replay) | 결정론적 재현을 위한 trace 녹화·재생 | episodic-memory 검색 (`search`) |
| Insights dashboard | 집계 메트릭 시각화 | statusline.sh (R012) + omcustom-improve-report |
| Annotation UI | ideal trajectory 편집 GUI | YAML 직접 편집 (.claude/outputs/evals/) |
| Run comparison | 에이전트 버전 간 성능 비교 | git diff 기반 수동 비교 |

### 5.2 claude-mem 기반 Step Trace

각 tool call 완료 후 claude-mem에 step record를 저장한다:

```
# 의사코드 — agent-eval-framework 스킬이 내부적으로 실행
mcp__plugin_claude-mem_mcp-search__save_memory(
  content="[eval-step] task=file_ops_001 step=1 tool=Read target=src/main.go elapsed_ms=142 status=ok",
  metadata={
    "type": "eval_step",
    "task_id": "file_ops_001",
    "step": 1,
    "tool": "Read",
    "elapsed_ms": 142
  }
)
```

세션 종료 후 `search_memory(query="eval-step task=file_ops_001")`으로 전체 trace 재구성.

**한계**: claude-mem은 문자열 기반 저장이므로 구조화 쿼리가 제한적이다. 복잡한 집계는 저장된 record를 Read로 불러와 수동 파싱해야 한다.

**우회법**: step record를 `.claude/outputs/evals/{task-id}/trace.jsonl`에 병행 기록하면 `Bash(jq)` 파이프라인으로 집계 가능하다.

### 5.3 episodic-memory 기반 재현

`episodic-memory` MCP는 대화를 자동 인덱싱한다. 이전 eval 실행을 재현하거나 참조할 때 활용:

```
# 이전 eval 실행 검색
mcp__plugin_episodic-memory_episodic-memory__search(
  query="agent-eval task file_ops_001"
)
```

**한계**: episodic-memory는 대화 단위 인덱싱이므로 step 단위 세밀도가 낮다. Polly의 결정론적 재현과 달리, 동일 결과를 보장하지 않는다.

**우회법**: eval 실행 전 `.claude/outputs/evals/{task-id}/context.md`에 환경 스냅샷을 저장하고, 재현 시 해당 파일을 컨텍스트로 주입한다.

### 5.4 statusline.sh + omcustom-improve-report 기반 대시보드

R012의 `statusline.sh`는 실시간 세션 상태를 표시한다. eval 결과는 `omcustom-improve-report` 스킬로 집계 리포트를 생성한다:

```bash
# .claude/outputs/evals/ 하위 결과 집계 예시
find .claude/outputs/eval -name "result.yaml" | \
  xargs yq eval '[.task_id, .correctness, .step_ratio, .tool_call_ratio, .latency_ratio] | @csv' | \
  awk -F',' 'BEGIN{print "task,correct,step_r,tool_r,lat_r"} {print}'
```

**한계**: 집계가 수동이며, LangSmith Insights의 시계열 추이나 분포 시각화는 제공하지 않는다.

**향후 보강**: monitoring-setup의 `trajectory-otel` 모드(#1035)로 step trace를 OTEL span으로 내보내고 Grafana에서 시각화하는 경로가 열린다.

### 5.5 OpenTelemetry Trajectory Export (#1035)

`monitoring-setup` 스킬의 `trajectory-otel` 모드를 활성화하면 agent-eval-framework가 측정한 4-metric 데이터를 OTEL span/event로 내보낸다.

**활성화**: `/monitoring-setup trajectory-otel on`
**비활성화**: `/monitoring-setup trajectory-otel off`

#### Span 구조

```
operation: agent.invocation
attributes:
  agent.type, agent.model, task.id, task.capability
  metric.correctness, metric.step_ratio, metric.tool_call_ratio, metric.latency_ratio
events:
  tool_call (tool_name, duration_ms, exit_code)
```

#### 내보내기 옵션

| 옵션 | 조건 | 대상 |
|------|------|------|
| Console exporter | 기본 (항상) | stdout — 로컬 디버깅 |
| OTLP exporter | `OTEL_EXPORTER_OTLP_ENDPOINT` 환경변수 설정 시 | Grafana / Datadog / Honeycomb 등 |

#### 장점

- **표준 OTEL 생태계**: LangSmith 의존 없음. 모든 OTLP 호환 collector에 연결 가능.
- **다른 LLM 시스템과 비교**: 동일 OTEL 인프라를 사용하는 시스템(예: LangChain) 메트릭과 직접 비교 가능.
- **기존 모니터링과 독립**: `enable`/`disable` 콘솔 모니터링과 별도 토글. 동시 활성화 가능.

#### 대안 매핑 테이블 업데이트

| LangChain 컴포넌트 | 역할 | oh-my-customcode 대안 |
|--------------------|------|----------------------|
| LangSmith trace | step별 실행 기록 수집 | claude-mem `save_memory` per step (5.2) |
| Polly (record/replay) | 결정론적 재현 | episodic-memory 검색 (5.3) |
| Insights dashboard | 집계 메트릭 시각화 | statusline.sh + omcustom-improve-report (5.4) |
| **LangSmith OTEL export** | **표준 OTEL span 수집** | **trajectory-otel mode (5.5, #1035)** |

---

## 6. Phased Gate Workflow 통합 사례

4-metric eval을 기존 oh-my-customcode 워크플로우에 게이트로 삽입하는 구체적 예시.

### 6.1 mgr-creator: 신규 동적 에이전트 검증

mgr-creator는 동적 에이전트 생성 후 즉시 배포하는 대신, correctness gate를 통과한 에이전트만 등록한다:

```
[mgr-creator 워크플로우]
1. 신규 에이전트 생성 (.claude/agents/{name}.md)
2. agent-eval-framework 스킬 호출:
   - capability: 해당 에이전트의 도메인
   - eval_mode: correctness_only (fast gate)
3. correctness >= 1 (pass): 에이전트 routing 등록
   correctness = 0 (fail): 에이전트 재수정 후 재평가
4. 등록 후 필요 시 step_ratio, tool_call_ratio 측정 (옵션)
```

**게이트 기준**: `correctness = 1` (신규 에이전트는 기본 작업 정확성 확보 필수)

### 6.2 worker-reviewer-pipeline: 정량 게이트 삽입

review → fix 루프에 정량 지표를 종료 조건으로 추가한다:

```
[worker-reviewer-pipeline + eval 게이트]
1. Worker: 구현
2. Reviewer: 코드 리뷰 + eval 실행
   - correctness: 테스트 통과 여부
   - tool_call_ratio: reviewer가 추가로 호출한 도구 수 측정
3. 게이트 판정:
   - correctness=fail → 재구현 (기존 루프)
   - correctness=pass, tool_call_ratio > 1.5 → 경고 + 루프 종료
   - correctness=pass, tool_call_ratio ≤ 1.5 → 완료
4. 최대 루프 횟수 도달 시 사람에게 에스컬레이션
```

### 6.3 deep-verify: 릴리즈 품질 정량 차원 (옵션)

deep-verify는 보안·품질·UX를 정성적으로 검증한다. 정량 eval은 옵션 차원으로 추가한다:

```
[deep-verify 릴리즈 체크리스트 — 옵션 항목]
□ 핵심 에이전트 correctness 재확인 (회귀 방지)
□ 신규 스킬의 step_ratio 기준치 측정 (baseline 등록)
□ latency_ratio 이상 에이전트 식별 (성능 회귀)
```

정량 eval은 deep-verify의 핵심 체크리스트를 **대체하지 않고 보완**한다. 실행 비용이 높으므로 전체 릴리즈가 아닌 신규 에이전트/스킬 포함 릴리즈에만 적용한다.

---

## 7. 기존 평가 스킬과의 관계

### 7.1 스킬 비교 매트릭스

| 스킬 | 평가 차원 | 접근 방식 | agent-eval-framework와의 관계 |
|------|-----------|-----------|-------------------------------|
| `harness-eval` | 15개 SE benchmark tasks | 정량 (pass/fail) | 보완: 4-metric layer 추가 — harness-eval의 task 결과에 step_ratio, tool_call_ratio, latency_ratio 측정 추가 |
| `evaluator-optimizer` | 정성 rubric loop | LLM-as-judge | 보완: efficiency gate 추가 — rubric 점수가 일정 기준 이상일 때만 efficiency 측정 진행 |
| `deep-verify` | 릴리즈 품질 (보안·품질·UX) | 정성 + 체크리스트 | 직교: 정량 metric 옵션 차원 — 서로 다른 평가 대상(릴리즈 vs 에이전트 행동) |
| `multi-model-verification` | 코드 정확성 (다중 모델 합의) | 정량 (합의율) | 직교: trajectory eval 부재 — multi-model-verification은 출력 정확성, agent-eval-framework는 실행 효율성 |

### 7.2 통합 평가 파이프라인 (권장 순서)

```
[평가 파이프라인]
1. correctness (agent-eval-framework)
   → fail: 에이전트 개선 → 재평가
   → pass: 다음 단계

2. efficiency (agent-eval-framework)
   step_ratio, tool_call_ratio, latency_ratio 측정
   → 기준 초과: 개선 권고 (블로커 아님)

3. rubric quality (evaluator-optimizer)
   정성 품질 평가
   → 점수 미달: 루프 재실행

4. release gate (deep-verify)
   보안·품질·UX 최종 검증
   → 실패: 릴리즈 차단
```

각 단계는 독립적으로 실행 가능하며, 전체 파이프라인은 선택적이다.

### 7.3 harness-eval 통합 상세

`harness-eval`의 15개 benchmark task에 4-metric layer를 추가하는 방법:

```yaml
# harness-eval task에 ideal_trajectory 추가
# .claude/skills/harness-eval/tasks/task_001.yaml
task_id: "harness_001"
# 기존 harness-eval 필드
description: "..."
expected_output: "..."

# agent-eval-framework 추가 필드
capability: file_operations
ideal_trajectory:
  - ...
metrics:
  ideal_steps: 3
  ideal_tool_calls: 3
  ideal_latency_ms: 2000
```

harness-eval이 task를 실행하면 agent-eval-framework가 4-metric을 측정한다. harness-eval의 기존 pass/fail이 correctness로 매핑된다.

---

## 8. 참고 자료

### 출처

- **LangChain Blog**: [How We Build Evals for Deep Agents](https://www.langchain.com/blog/how-we-build-evals-for-deep-agents)
  - 4-metric framework 원출처
  - Capability-categorical taxonomy 정의
  - Ideal trajectory annotation 방법론

### 관련 스킬

| 스킬 | 경로 | 역할 |
|------|------|------|
| `agent-eval-framework` | `.claude/skills/agent-eval-framework/SKILL.md` | 이 가이드의 방법론을 실행하는 스킬 |
| `harness-eval` | `.claude/skills/harness-eval/SKILL.md` | 15개 SE benchmark task 실행 |
| `evaluator-optimizer` | `.claude/skills/evaluator-optimizer/SKILL.md` | 정성 rubric 기반 반복 개선 |

### 관련 규칙

| 규칙 | 관련성 |
|------|--------|
| R020 (완료 검증) | correctness check = R020의 정량 구현 |
| R017 (구조 검증) | 신규 eval annotation 추가 시 sauron-watch 통과 필요 |
| R009 (병렬 실행) | 병렬 tool call의 step/tool_call 카운트 정의에 영향 |
| R013 (Ecomode) | summarization capability 평가 시 ecomode 압축 효과 고려 |

### 관련 이슈

- `#1025` — Agent Eval Framework 내재화 (이 가이드 및 `agent-eval-framework` 스킬 생성)

### 관련 가이드

| 가이드 | 경로 | 관련성 |
|--------|------|--------|
| harness-engineering | `guides/harness-engineering/` | 평가 하네스 인프라 설계 |
| monitoring-setup | `guides/monitoring-setup/` | OTEL 통합 (향후 tracing 보강) |
| multi-agent-debate-patterns | `guides/multi-agent-debate-patterns/` | 다중 에이전트 평가 패턴 |
