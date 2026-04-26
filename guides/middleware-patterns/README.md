# Middleware Patterns

> 에이전트 하네스를 커스터마이즈하기 위한 lifecycle middleware 패턴 가이드
> 출처: LangChain Blog — "How Middleware Lets You Customize Your Agent Harness"
> 관련 이슈: #1022

## 개요

LangChain은 2024년 말 **Agent Middleware** 개념을 공개했습니다. 핵심 아이디어는 단순합니다: 에이전트의 실행 흐름에는 명확한 lifecycle stage가 존재하며, 각 단계에 훅을 걸어 행동을 가로채거나 변환하거나 보강할 수 있다는 것입니다.

oh-my-customcode는 독립적으로 동일한 방향을 진화해 왔습니다. `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop` 같은 Claude Code 네이티브 훅 이벤트와, `pre-generation-arch-check`, `action-validator`, `pipeline-guards` 같은 스킬이 이미 lifecycle 단계별로 에이전트 행동을 제어하고 있습니다.

그러나 **공통 어휘가 없었습니다.** 새 스킬이나 훅을 추가할 때 "이것이 어느 lifecycle 단계에 해당하는가"를 묻는 사람이 없었고, 따라서 체계적인 분류 없이 임기응변으로 추가되어 왔습니다.

이 가이드는 LangChain의 6단계 middleware 모델을 oh-my-customcode 기존 자산에 매핑하여 **통합 어휘**를 확립합니다. 새 훅이나 스킬을 작성할 때 어느 단계에 속하는지 명시하는 관행을 만드는 것이 목표입니다.

---

## 1. Lifecycle 6단계와 oh-my-customcode 매핑

LangChain이 정의한 6개의 lifecycle hook은 다음과 같습니다. 각 단계에 oh-my-customcode의 대응 메커니즘과 구체적인 예시를 매핑합니다.

| LangChain Hook | 설명 | oh-my-customcode 대응 | 스킬/훅 예시 |
|---|---|---|---|
| `before_agent` | 에이전트 전체 실행 시작 전 | `SessionStart`, `UserPromptSubmit` hook | claude-mem session-start, omcustom-loop 초기화 |
| `before_model` | 모델 호출 직전 (매 추론 루프마다) | `PreToolUse(Agent)`, pre-generation-arch-check | pre-generation-arch-check 스킬 |
| `wrap_model_call` | 모델 호출 자체를 래핑 (실제 호출 제어) | Tier 4 permission approval (Bash/WebFetch) | permission hooks, bypassPermissions 게이트 |
| `wrap_tool_call` | 도구 호출을 래핑 (전후 모두 제어) | `PreToolUse(*) + PostToolUse(*)` | action-validator, task-outcome-recorder |
| `after_model` | 모델 응답 수신 직후 | `PostToolUse(Agent)`, result-aggregation | result-aggregation 스킬, evaluator-optimizer |
| `after_agent` | 에이전트 전체 실행 완료 후 | `Stop`, `SubagentStop`, post-release-followup | omcustom-loop SubagentStop hook |

### 매핑 해설

**`before_agent` → SessionStart / UserPromptSubmit**

에이전트가 실행을 시작하기 전에 필요한 컨텍스트를 주입하거나 상태를 초기화합니다. oh-my-customcode에서는 `SessionStart` 훅이 이 역할을 담당합니다. claude-mem의 세션 시작 시 메모리 로드, MEMORY.md의 자동 주입이 전형적인 `before_agent` 패턴입니다. R007의 에이전트 식별 헤더 출력도 이 단계의 산물입니다.

**`before_model` → PreToolUse(Agent) + pre-generation-arch-check**

모델이 추론을 시작하기 직전, 즉 에이전트가 다음 액션을 결정하기 전에 개입합니다. `pre-generation-arch-check` 스킬은 모델이 코드를 생성하기 전에 아키텍처 경계를 검사하는 전형적인 `before_model` 미들웨어입니다. `PreToolUse(Agent)` 훅도 서브에이전트 스폰 직전에 유효성을 검사합니다.

**`wrap_model_call` → Permission 게이트**

모델 호출 자체를 가로채는 가장 강력한 단계입니다. LangChain에서는 이 단계에서 모델을 교체하거나 호출을 완전히 차단할 수 있습니다. oh-my-customcode에서는 Tier 4 도구(Bash, WebFetch)의 permission approval이 이에 해당합니다. `bypassPermissions` 모드와 허용 규칙은 이 게이트를 제어하는 메커니즘입니다.

**`wrap_tool_call` → PreToolUse(*) + PostToolUse(*)**

도구 호출의 전후를 모두 제어하는 단계입니다. `PreToolUse`는 호출 직전 검사(유효성, 권한, 범위 초과 방지), `PostToolUse`는 호출 직후 결과 기록과 감사를 담당합니다. `action-validator` 스킬은 에이전트가 선언된 도구 범위 내에서만 실행하는지 pre-flight 검사를 수행하는 `wrap_tool_call` 패턴의 구현입니다.

**`after_model` → PostToolUse(Agent) + result-aggregation**

모델이 응답을 생성한 직후, 결과를 소비하거나 변환하는 단계입니다. `result-aggregation` 스킬이 병렬 에이전트 결과를 수집·합산하는 것이 `after_model` 패턴입니다. `evaluator-optimizer` 스킬도 모델 출력을 평가하고 개선 사이클을 트리거하는 이 단계에 속합니다.

**`after_agent` → Stop / SubagentStop**

에이전트 실행 전체가 완료된 후 클린업, 메모리 저장, 후속 작업 트리거를 수행합니다. oh-my-customcode의 `Stop` 훅(세션 종료 시 메모리 저장 권고)과 `SubagentStop` 훅(서브에이전트 완료 후 omcustom-loop 계속 여부 결정)이 여기에 해당합니다.

---

## 2. 주요 Middleware 패턴 3종

LangChain 블로그가 제시한 3가지 대표 패턴을 oh-my-customcode 맥락으로 구체화합니다.

### 2-1. PII 마스킹 패턴 (PIIMiddleware)

LangChain의 `PIIMiddleware`는 `before_model` 단계에서 사용자 입력의 민감 데이터를 마스킹하고, `after_model` 단계에서 마스킹을 복원합니다.

oh-my-customcode에서는 이 패턴이 다음 방식으로 구현됩니다:

- **입력 마스킹**: `UserPromptSubmit` 훅에서 정규식 기반 PII 패턴 제거 (현재는 rule-level 권고)
- **메모리 위생**: `sys-memory-keeper`가 MEMORY.md에 민감 데이터를 저장하지 않도록 R011에서 명시
- **episodic-memory 분리**: 대화 인덱싱 전 민감 세션은 제외 처리
- **audit trail**: `PostToolUse` 훅이 도구 호출 기록을 남기되, 시크릿/토큰은 stdout/stderr에 노출하지 않음

신규 PII 마스킹 미들웨어를 작성한다면 `before_agent`(세션 전체 PII 정책 초기화)와 `wrap_tool_call`(개별 도구 호출의 인자 검사) 두 단계의 조합으로 설계하는 것을 권장합니다.

```
[before_agent] PII 정책 로드 → 마스킹 사전 초기화
     ↓
[wrap_tool_call: PreToolUse] 도구 인자에서 PII 패턴 탐지 → 치환
     ↓
[wrap_tool_call: PostToolUse] 마스킹된 출력 → 복원 또는 제거
```

### 2-2. 요약 패턴 (SummarizationMiddleware)

LangChain의 `SummarizationMiddleware`는 장기 대화에서 누적된 메시지를 `before_model` 단계에 요약하여 컨텍스트 창을 절약합니다.

oh-my-customcode에서 이 패턴은 R013 ecomode와 result-aggregation 스킬의 조합으로 구현됩니다:

- **R013 ecomode**: 컨텍스트 80%+ 사용 또는 4+ 병렬 태스크 시 자동 활성화. 에이전트 출력을 `status + summary (1-2 sentences) + key_data`로 압축
- **result-aggregation**: 병렬 에이전트 N개의 전문 결과를 단일 통합 요약으로 합산 (`after_model` 단계)
- **PreCompact 훅**: 컨텍스트 압축 직전에 중요 상태를 MEMORY.md에 checkpoint
- **Deep Insight Context Handoff Pattern**: 에이전트 간 핸드오프 시 전체 컨텍스트 대신 아티팩트 파일 경로만 전달

```
[before_model] ecomode 체크 → 컨텍스트 80%+ 감지 시 이전 턴 요약 주입
     ↓
[after_model] result-aggregation → N 에이전트 결과를 단일 요약으로
     ↓
[before_agent (다음 사이클)] 아티팩트 경로만 핸드오프 (inline 본문 금지)
```

### 2-3. 재시도 패턴 (ModelRetryMiddleware)

LangChain의 `ModelRetryMiddleware`는 모델 호출 실패 시 지수 백오프로 재시도합니다.

oh-my-customcode에서 이 패턴은 R004의 재시도 정책으로 명문화되어 있습니다:

- **재시도 횟수**: 최대 3회 (1초 → 2초 → 4초 지수 백오프)
- **재시도 대상**: `retryable` 오류 (일시적 API 실패, 타임아웃 등)
- **비재시도 대상**: `non-recoverable` 오류 (권한 없음, 파일 없음 등)
- **구현 위치**: `wrap_model_call` 단계 — 모델 호출 자체를 래핑

```
[wrap_model_call] 모델 호출 시도
  → 성공: 결과 반환
  → 실패: retryable? YES → 백오프 후 재시도 (최대 3회)
                    NO  → 상태 보존 + 오류 보고 + 사용자 대기
```

---

## 3. Lifecycle Stage별 스킬/훅 분류 테이블

신규 스킬 또는 훅을 작성할 때 이 테이블을 참조하여 적절한 단계를 선택하세요.

### before_agent 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| `SessionStart` hook | 훅 이벤트 | 세션 초기화, 메모리 로드 |
| `UserPromptSubmit` hook | 훅 이벤트 | 사용자 입력 전처리, PII 검사 |
| claude-mem session-start | MCP 패턴 | 이전 세션 컨텍스트 복원 |
| R007 에이전트 식별 헤더 | 규칙 | 에이전트 신원 선언 |
| MEMORY.md 자동 주입 | 네이티브 기능 | 200줄 메모리 컨텍스트 주입 |

### before_model 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| `pre-generation-arch-check` | 스킬 | 코드 생성 전 아키텍처 경계 검사 |
| `PreToolUse(Agent)` | 훅 이벤트 | 서브에이전트 스폰 직전 검증 |
| `pipeline-guards` | 스킬 | 파이프라인 단계 진입 전 사전 조건 검사 |
| R009 병렬 실행 체크 | 규칙 | 독립 태스크 2+ 시 병렬화 강제 |

### wrap_model_call 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| Tier 4 permission approval | 권한 메커니즘 | Bash/WebFetch 호출 사용자 승인 |
| `bypassPermissions` 모드 | 설정 | 자동화 파이프라인에서 게이트 우회 |
| `sandboxFailIfUnavailable` | 에이전트 설정 | 샌드박스 미가용 시 실행 차단 |
| `disallowedTools` 선언 | 프론트매터 | 특정 도구를 에이전트 레벨에서 금지 |

### wrap_tool_call 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| `PreToolUse(*)` | 훅 이벤트 | 모든 도구 호출 직전 검증 |
| `PostToolUse(*)` | 훅 이벤트 | 모든 도구 호출 직후 결과 기록 |
| `action-validator` | 스킬 | 에이전트가 선언된 도구 범위 내에서 실행하는지 pre-flight 검사 |
| `task-outcome-recorder` | 스킬 | 도구 호출 결과를 구조화된 형식으로 기록 |
| rule-deletion-guard.sh | 훅 스크립트 | 규칙 파일 삭제 시도 하드 블록 (exit 2) |
| `git-delegation-guard.sh` | 훅 스크립트 | git 직접 실행 시도 감지 및 경고 |

### after_model 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| `PostToolUse(Agent)` | 훅 이벤트 | 서브에이전트 완료 후 결과 처리 |
| `result-aggregation` | 스킬 | 병렬 에이전트 N개의 결과를 단일 요약으로 합산 |
| `evaluator-optimizer` | 스킬 | 출력 품질 평가 후 개선 사이클 트리거 |
| `worker-reviewer-pipeline` | 스킬 | worker 출력 → reviewer 검증 파이프라인 |
| R013 ecomode 압축 | 규칙 | 컨텍스트 초과 시 출력 자동 압축 |

### after_agent 단계

| 자산 | 유형 | 역할 |
|---|---|---|
| `Stop` hook | 훅 이벤트 | 세션 종료 시 메모리 저장 권고 |
| `SubagentStop` hook | 훅 이벤트 | 서브에이전트 완료 후 omcustom-loop 계속 여부 결정 |
| `omcustom-loop` | 스킬 | 파이프라인 완료 후 다음 사이클 트리거 |
| sys-memory-keeper | 에이전트 | 세션 종료 시 MEMORY.md 업데이트 |
| `SubagentStart` hook | 훅 이벤트 | 서브에이전트 시작 시 HUD 이벤트 발행 |

---

## 4. Composition 패턴

### 4-1. 단계별 Chaining

단계를 직렬로 연결하는 가장 기본적인 패턴입니다. 각 단계의 출력이 다음 단계의 입력이 됩니다.

```
[before_agent]
  SessionStart → MEMORY.md 로드 → claude-mem 컨텍스트 복원
       ↓
[before_model]
  pre-generation-arch-check → 아키텍처 경계 검증
       ↓
[wrap_tool_call]
  PreToolUse → 권한 검사
  (도구 실행)
  PostToolUse → 결과 기록
       ↓
[after_model]
  result-aggregation → 결과 합산
       ↓
[after_agent]
  Stop → sys-memory-keeper → MEMORY.md 업데이트
```

### 4-2. 동일 단계에 여러 훅 (Priority/Ordering)

같은 lifecycle 단계에 여러 훅이 등록된 경우, 실행 순서가 중요합니다.

oh-my-customcode의 현재 관행:

- `hooks.json`의 `PreToolUse` 섹션에 여러 matcher를 순서대로 선언
- 먼저 선언된 matcher가 먼저 실행됨
- 각 matcher는 독립적으로 exit code를 반환 (exit 2 = 하드 블록, exit 0 = 통과)
- matcher 조건이 겹치면 더 좁은 조건(더 구체적인 matcher)을 먼저 선언

```json
// hooks.json에서 PreToolUse 순서 예시
{
  "PreToolUse": [
    { "matcher": "Bash(rm -rf*)", "command": "exit 2" },       // 1순위: 하드 블록
    { "matcher": "Bash(.claude/*)", "command": "warn.sh" },    // 2순위: 경고
    { "matcher": "Agent|Task", "command": "hud-spawn.sh" }     // 3순위: HUD 이벤트
  ]
}
```

### 4-3. 단계 건너뛰기 (When Not Needed)

모든 에이전트가 6단계 전부를 구현할 필요는 없습니다. 단계 선택 기준:

| 상황 | 건너뛸 수 있는 단계 | 이유 |
|---|---|---|
| 단순 읽기 전용 에이전트 | `wrap_tool_call` | Read/Glob/Grep만 사용, 검증 불필요 |
| 단발성 태스크 (세션 미지속) | `before_agent`, `after_agent` | 메모리 초기화/저장 불필요 |
| 비용 민감 소형 배치 | `before_model`, `after_model` | 아키텍처 검사 오버헤드 생략 |
| 완전 자동화 파이프라인 | `wrap_model_call` (게이트 우회) | `bypassPermissions`로 승인 단계 제거 |

건너뛰는 단계는 에이전트 프론트매터의 `limitations` 필드에 명시하는 것을 권장합니다:

```yaml
limitations:
  - "no before_model arch-check (read-only agent)"
  - "no after_agent memory save (ephemeral task)"
```

### 4-4. 병렬 단계 (Parallel at Same Stage)

동일 단계에서 여러 에이전트를 병렬 실행하는 경우(R009), 각 에이전트는 독립적인 단계 인스턴스를 실행합니다.

```
[before_model] ─────────────────────────────────────────────
    ├── [1] lang-golang-expert: pre-generation-arch-check
    ├── [2] lang-python-expert: pre-generation-arch-check
    └── [3] lang-typescript-expert: pre-generation-arch-check
         ↓ (병렬 완료 후)
[wrap_tool_call] ────────────────────────────────────────────
    ├── [1] Go 파일 생성
    ├── [2] Python 파일 생성
    └── [3] TypeScript 파일 생성
```

병렬 단계에서는 공유 상태 변경이 금지됩니다(R010: orchestrator만 파일 수정). 각 병렬 에이전트는 자신의 scope 내에서만 작업합니다.

---

## 5. 신규 Middleware 작성 가이드

### 5-1. Lifecycle Stage 결정 플로우

신규 훅이나 스킬을 작성할 때 먼저 다음 질문으로 단계를 결정합니다:

```
Q1. 에이전트 전체 실행의 시작/종료와 관련인가?
    YES → before_agent (초기화) 또는 after_agent (정리)
    NO  → Q2

Q2. 모델 추론 직전/직후와 관련인가?
    YES → before_model (사전 검사) 또는 after_model (결과 처리)
    NO  → Q3

Q3. 개별 도구 호출 전후와 관련인가?
    YES → wrap_tool_call (PreToolUse + PostToolUse)
    NO  → Q4

Q4. 모델 호출 자체를 제어/차단/교체해야 하는가?
    YES → wrap_model_call (permission 게이트, 모델 교체)
    NO  → 스킬이 아닌 에이전트 또는 규칙으로 처리
```

### 5-2. Hook vs Skill 결정 매트릭스

| 요구사항 | Hook | Skill |
|---|---|---|
| 자동 실행 (사용자 개입 없이) | ✅ | ❌ |
| 하드 블록 필요 (exit 2) | ✅ | ❌ |
| 복잡한 비즈니스 로직 | ❌ | ✅ |
| 다른 에이전트 스폰 필요 | ❌ | ✅ |
| 재사용 가능한 독립 단위 | ❌ | ✅ |
| 특정 도구 이벤트에만 반응 | ✅ | ❌ |
| 사용자가 직접 호출 | ❌ | ✅ (`user-invocable: true`) |
| 세션 전체에 걸쳐 항상 실행 | ✅ | ❌ |
| 조건부 실행 (특정 파일 패턴 등) | ✅ (matcher) | ✅ (paths 필드) |

**훅이 적합한 경우**: 보안 강제, 감사 로깅, HUD 이벤트, 하드 블록, 자동 메모리 저장
**스킬이 적합한 경우**: 복잡한 검증 워크플로우, 멀티 에이전트 조율, 사용자 명시 호출, 재사용 로직

### 5-3. Hook Event Type 선택 가이드

| 이벤트 | lifecycle 단계 | 사용 시기 |
|---|---|---|
| `SessionStart` | before_agent | 세션 초기화, 메모리 로드 |
| `UserPromptSubmit` | before_agent | 사용자 입력 전처리, 라우팅 힌트 주입 |
| `SubagentStart` | before_model | 서브에이전트 스폰 HUD 이벤트 |
| `PreToolUse` | wrap_tool_call (before) | 도구 호출 직전 검증, 하드 블록 |
| `PostToolUse` | wrap_tool_call (after) | 도구 호출 결과 기록, 감사 |
| `SubagentStop` | after_model | 서브에이전트 결과 수집, 루프 계속 여부 |
| `Stop` | after_agent | 세션 종료 처리, 메모리 저장 |
| `PreCompact` | wrap_model_call | 컨텍스트 압축 직전 중요 상태 checkpoint |
| `PostCompact` | before_model | 압축 후 MUST 규칙 재주입 |
| `Notification` | after_model | 외부 알림 발송 (Slack 등) |

### 5-4. 신규 Hook 작성 예시

새 middleware를 hook으로 구현하는 최소 템플릿:

```bash
#!/bin/bash
# lifecycle: wrap_tool_call (PreToolUse)
# purpose: <목적 한 줄 설명>
# stage: before / after

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

# 조건 검사
if [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_INPUT" | grep -qF "위험_패턴"; then
  echo "[middleware] 경고: 위험 패턴 감지 — $TOOL_INPUT" >&2
  exit 2  # 하드 블록 (advisory only는 exit 0)
fi

exit 0
```

hooks.json 등록:
```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "command": ".claude/hooks/your-middleware.sh",
      "description": "lifecycle: wrap_tool_call — 위험 패턴 감지"
    }
  ]
}
```

### 5-5. 신규 Skill로 작성 시 SKILL.md 권장 필드

```yaml
---
name: your-middleware-skill
description: |
  [lifecycle: before_model] 모델 호출 직전 <목적> 검증
  LangChain before_model 패턴 구현.
# lifecycle 주석 포함 권장 ↑
scope: core
effort: medium
allowed-tools: [Read, Glob, Grep]
limitations:
  - "cannot block execution (advisory only)"
---
```

`description` 첫 줄에 `[lifecycle: <단계>]`를 명시하면 향후 분류 테이블 자동 생성이 가능합니다.

### 5-6. Testing 패턴

| 단계 | 테스트 접근 |
|---|---|
| `before_agent` | 세션 시작 시 MEMORY.md가 올바르게 로드되는지 확인 |
| `before_model` | 경계 위반 케이스로 스킬 호출 → 경고/차단 여부 확인 |
| `wrap_model_call` | `bypassPermissions: false` 환경에서 Tier 4 도구 호출 시 프롬프트 발생 확인 |
| `wrap_tool_call` | PreToolUse hook script를 직접 실행하여 exit code 검증 |
| `after_model` | 병렬 에이전트 결과 파일을 수동으로 생성 후 result-aggregation 스킬 호출 |
| `after_agent` | Stop hook script를 직접 실행하여 메모리 저장 동작 확인 |

훅 스크립트의 단위 테스트:
```bash
# PreToolUse hook 직접 테스트
CLAUDE_TOOL_NAME="Bash" CLAUDE_TOOL_INPUT="rm -rf /" .claude/hooks/your-middleware.sh
echo "Exit: $?"  # 0 또는 2 확인
```

---

## 6. 참고 자료

### 출처

- **LangChain Blog**: "How Middleware Lets You Customize Your Agent Harness"
  URL: https://www.langchain.com/blog/how-middleware-lets-you-customize-your-agent-harness
  핵심 개념: 6 lifecycle hooks, PIIMiddleware, SummarizationMiddleware, ModelRetryMiddleware

### 관련 스킬 (oh-my-customcode)

| 스킬 | Lifecycle Stage | 역할 |
|---|---|---|
| `pre-generation-arch-check` | before_model | 코드 생성 전 아키텍처 경계 검사 |
| `action-validator` | wrap_tool_call | 에이전트 도구 범위 pre-flight 검사 |
| `pipeline-guards` | before_model | 파이프라인 단계 진입 전 사전 조건 |
| `evaluator-optimizer` | after_model | 출력 평가 후 개선 사이클 |
| `worker-reviewer-pipeline` | after_model | worker 출력 → reviewer 검증 |
| `result-aggregation` | after_model | 병렬 결과 합산 |

### 관련 가이드

- [harness-engineering](../harness-engineering/README.md) — 3-Layer Hierarchy, 에이전트 구조 설계, Artifact Channel Protocol. middleware-patterns가 해결하는 "어느 단계에" 문제의 구현 상세를 다룸.

### 관련 규칙

| 규칙 | Lifecycle 연관성 |
|---|---|
| R001 (Safety) | wrap_model_call 단계의 금지 행동 정의 |
| R002 (Permissions) | wrap_model_call 게이트의 Tier 분류 |
| R004 (Error Handling) | wrap_model_call의 재시도 정책 (3x 지수 백오프) |
| R006 (Agent Design) | 에이전트 프론트매터의 훅 선언 방법 |
| R009 (Parallel Execution) | 동일 단계에서 병렬 에이전트 실행 규칙 |
| R010 (Orchestrator) | before_agent/after_agent의 위임 규칙 |
| R013 (Ecomode) | after_model의 요약/압축 패턴 |
| R016 (Continuous Improvement) | after_agent 이후 규칙 업데이트 루프 |

### 관련 이슈

- [#1022](https://github.com/baekenough/oh-my-customcode/issues/1022) — middleware-patterns 가이드 생성 이슈
