# [MUST] Tool Usage Identification Rules

> **Priority**: MUST | **ID**: R008

## Core Rule

Every tool call MUST be prefixed with agent and model identification:

```
[agent-name][model] → Tool: <tool-name>
[agent-name][model] → Target: <file/path/url>
```

For parallel calls: list ALL identifications BEFORE the tool calls.

### Common Violations to Avoid

```
❌ Missing: tool call with no identification prefix
✓ Correct: [agent-name][model] → Tool: WebFetch
           [agent-name][model] → Fetching: url
           <tool_call>...</tool_call>
```

<!-- DETAIL: Full violation examples
Incorrect: Calling tools without identification — no [agent][model] prefix before tool_call
Incorrect: Missing model — [secretary] → Tool: WebFetch (missing [model])
Correct: [secretary][opus] → Tool: WebFetch / [secretary][opus] → Fetching: url / then tool_call

Incorrect parallel: tool_call(url1), tool_call(url2), tool_call(cmd) — no identification
Correct parallel: list ALL [agent][model] → Tool/Fetching/Running lines FIRST, then all tool_calls
-->

### Required-Parameter Completeness Check

R008 prefix(announce)와 실제 도구 호출은 분리된 단계다. prefix 를 출력한 뒤 호출 payload 에서 도구 스키마상 required 파라미터를 누락하면 호출이 실패하거나 빈 동작이 된다. 호출 직전, prefix 존재뿐 아니라 required 파라미터가 모두 채워졌는지 확인한다.

| Anti-pattern | Required |
|--------------|----------|
| AskUserQuestion 호출 앞에 Core Rule 형식의 prefix 라인(에이전트·모델 대괄호 다음 화살표와 Tool 표기)만 출력하고 `questions` 파라미터 없이/빈 배열로 호출 | prefix + `questions` 배열(최소 1개) 모두 채워 호출 |
| announce 후 payload 의 required 필드 누락 (announce-payload separation gap) | announce 와 동일 메시지에서 required 필드 완비 호출 |

Cross-reference: R020 (action-completeness precondition — invoke 전에 required 파라미터 확인). Reference issue: #1324 (찐빠: AskUserQuestion `questions`-missing recurrence).

## Models

| Model | Use |
|-------|-----|
| `opus` | Complex reasoning, architecture |
| `sonnet` | General tasks, code generation (default) |
| `haiku` | Fast simple tasks, file search |

## Tool Categories

| Category | Tools | Verb |
|----------|-------|------|
| File Read | Read, Glob, Grep | Reading / Searching |
| File Write | Write, Edit | Writing / Editing |
| Network | WebFetch | Fetching |
| Execution | Bash, Agent | Running / Spawning |

## Agent Tool Format

```
subagent_type:model → description
```

`subagent_type` MUST match actual Agent tool parameter. Custom names not allowed.

## Parallel Spawn Prefix Rule

When spawning 2+ agents in parallel, each agent's `description` parameter MUST include a `[N]` prefix (1-indexed) to enable correlation with the Running display:

```
Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert")
Agent(description: "[2] Python code review", subagent_type: "lang-python-expert")
```

Single agent spawns do NOT use the `[N]` prefix.

This ensures the Running display:
```
⏺ Running 2 agents… (ctrl+o to expand)
   ├─ [1] Go code review · ...
   └─ [2] Python code review · ...
```

matches the spawn announcement:
```
[secretary][opus] → Spawning:
  [1] lang-golang-expert:sonnet → Go code review
  [2] lang-python-expert:sonnet → Python code review
```

### Spawn Announce 리터럴 — advisor 정규식 정합 (Origin: #1595 #5)

위 예시는 `.claude/hooks/scripts/r007-r008-drift-advisor.sh`의 판정식과 리터럴로 일치한다. 다음 변형은 **미매칭**되어, 규칙을 지킨 응답이 R008 위반으로 계상된다.

| 금지 변형 | 미매칭 이유 |
|-----------|-------------|
| 번호 앞에 리스트 마커(`- `)나 백틱을 붙임 | spawn-item 정규식은 **줄 시작의 대괄호 숫자**를 요구하며, 선행 공백만 허용한다 |
| Spawning 뒤 콜론 생략 (예: "Spawning 4 agents") | 헤더 정규식이 **콜론**을 요구한다 |
| 에이전트타입:모델 뒤에 화살표 없이 설명만 이어붙임 | spawn-item 정규식이 **화살표**를 요구한다 (U+2192 / ASCII 하이픈-부등호 / U+2014-부등호 3종만 인식) |

규칙 문구와 탐지기 정규식이 어긋나면 오탐 계수가 다시 규칙 개정의 근거가 되는 악순환이 생긴다. 형식을 바꿀 때는 advisor 정규식을 같은 커밋에서 갱신한다(R016 Rule Wiring Check).

**문서 작성 주의**: advisor의 announce 정규식에는 줄 시작 앵커가 없어, 표 셀·인라인 백틱 안에 완전한 리터럴을 넣으면 **그 문서를 인용하는 응답 턴이 announce로 오계상**된다(482턴 실측에서 실제 발생). 형식 예시는 코드 펜스 안에 줄 시작으로만 두고, 표에서는 산문으로 서술한다.

Cross-ref: R009 「Narrative Announcement Format」(같은 리터럴을 산문 announce에 적용), R020 「자가 계수는 advisor 판정식을 재현한다」.

Origin: #1595 #5 (v1.1.48 세션 — R008 위반 3건이 단일 턴에 집중. tool_use=5 / announce=2로 계산됐고, 실제 announce는 리스트 마커와 백틱이 앞에 붙은 형식이라 전부 미매칭. 헤더도 콜론이 없었다).

<!--
> **v2.1.174+**: Fixed the Workflow tool's `agent()` subagents missing per-agent attribution headers. Workflow-spawned subagents now carry attribution consistent with R008 — when authoring Workflow scripts, each `agent()` call is attributed like a direct Agent tool spawn. Align Workflow orchestration with the R008 `[agent][model] → Tool:` identification discipline: a Workflow `agent()` fan-out should still be reasoned about with the same per-agent identification model as parallel Agent tool spawns.
-->

## Tier-3 Interaction Tool Prefix (MANDATORY)

R008 "every tool call" applies to Tier-3 interaction tools too — NOT only file/exec tools. Applying the Core Rule prefix form (에이전트·모델 대괄호 다음 화살표와 Tool 표기) to Agent/Bash/Read while omitting it on `AskUserQuestion`, `TodoWrite`, `EnterPlanMode`, etc. is a violation.

| Tool | R008 prefix required? |
|------|----------------------|
| AskUserQuestion | YES — Core Rule 형식의 prefix(에이전트·모델 대괄호 + 화살표 + Tool 표기 + 도구명)를 호출 앞에 출력 |
| TodoWrite | YES |
| EnterPlanMode / ExitPlanMode | YES |
| Skill | NO separate R008 prefix — identified via R007 `claude → {skill-name}` integrated header instead |

Skill invocation is the one exception: it is identified through the R007 integrated identification block (`┌─ Agent: claude → {skill-name}`), not a standalone R008 tool prefix.

<!-- Reference issue: #1321 (session 113 retrospective, 찐빠 #2 — AskUserQuestion prefix omitted twice). -->

<!-- DETAIL: Consolidated Example (redundant with Parallel Spawn Prefix Rule example above)
## Example

[mgr-creator][sonnet] → Write: .claude/agents/new-agent.md
[secretary][opus] → Spawning:
  [1] lang-golang-expert:sonnet → Go code review
  [2] lang-python-expert:sonnet → Python code review

Parallel spawn description parameter:
Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert", ...)
Agent(description: "[2] Python code review", subagent_type: "lang-python-expert", ...)
-->

## Multi-Turn Self-Check (MANDATORY)

매 도구 호출 직전, 이전 호출이 prefix 를 가졌는지에 의존하지 말고 다시 자가 점검:

1. 이 호출 위에 Core Rule 형식의 prefix 라인(에이전트명·모델 대괄호 + 화살표 + Tool 표기 + 도구명)이 있는가?
2. agent-name 과 model 이 현재 컨텍스트와 일치하는가?
3. 이 호출에 도구 스키마상 required 파라미터가 모두 채워져 있는가? (예: AskUserQuestion 는 `questions` 배열이 비어 있지 않아야 함) prefix(announce)만 출력하고 실제 호출 payload 의 required 필드를 누락하면 안 된다.

체크 실패 시 즉시 prefix/필수 파라미터를 보완한 후 호출.

<!-- DETAIL: Common Multi-Turn Violation example (redundant with Self-Check steps above)
### Common Multi-Turn Violation

호출 1 (턴 1): [claude][sonnet] → Tool: Read ✓
호출 2 (턴 1, 같은 턴 추가 호출): (prefix 없음) ✗
호출 3 (턴 2 첫 호출): (prefix 없음) ✗

같은 턴 내 추가 호출, 새 턴 첫 호출 모두 prefix 필수.

Reference issue: #1096.
-->

### Short Response Discipline

도구 호출 prefix 도 응답 길이와 무관하게 필수. 같은 턴 내 여러 도구를 호출할 때 각 호출 직전에 개별 prefix 표시:

```
[agent][model] → Tool: Read
[agent][model] → Target: file1.md
<Read call>

[agent][model] → Tool: Bash
[agent][model] → Target: gh issue list
<Bash call>
```

<!-- Reference issues: #1188 item #3, #1198 item #3. -->

### External-Project / Debugging Session Vigilance

R007 헤더와 마찬가지로, R008 prefix 누락도 외부 프로젝트 디버깅·배포 세션에서 가장 자주 발생한다. R007/R008은 세트로 함께 자가 점검한다.

| 세션 유형 | R008 prefix |
|-----------|-------------|
| oh-my-customcode 작업 | 필수 |
| 외부 프로젝트 디버깅 | **동일하게 필수** |
| SSH / 배포 / 인프라 작업 | **동일하게 필수** |

<!-- DETAIL: Case history — 외부 프로젝트 진단 세션(#1417)에서 Bash/Edit/Read/Agent 모든 호출에 `[agent][model] → Tool:` prefix가 세션 전체 누락된 재발이 관측되었다 — 도구 호출 직전 prefix 부착을 워크플로에 내재화한다.
Reference issues: #1401, #1417.
-->
