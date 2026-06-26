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
| `[agent][model] → Tool: AskUserQuestion` prefix 만 출력하고 `questions` 파라미터 없이/빈 배열로 호출 | prefix + `questions` 배열(최소 1개) 모두 채워 호출 |
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

> **v2.1.174+**: Fixed the Workflow tool's `agent()` subagents missing per-agent attribution headers. Workflow-spawned subagents now carry attribution consistent with R008 — when authoring Workflow scripts, each `agent()` call is attributed like a direct Agent tool spawn. Align Workflow orchestration with the R008 `[agent][model] → Tool:` identification discipline: a Workflow `agent()` fan-out should still be reasoned about with the same per-agent identification model as parallel Agent tool spawns.

## Tier-3 Interaction Tool Prefix (MANDATORY)

R008 "every tool call" applies to Tier-3 interaction tools too — NOT only file/exec tools. Applying the `[agent][model] → Tool:` prefix to Agent/Bash/Read while omitting it on `AskUserQuestion`, `TodoWrite`, `EnterPlanMode`, etc. is a violation.

| Tool | R008 prefix required? |
|------|----------------------|
| AskUserQuestion | YES — `[agent][model] → Tool: AskUserQuestion` before the call |
| TodoWrite | YES |
| EnterPlanMode / ExitPlanMode | YES |
| Skill | NO separate R008 prefix — identified via R007 `claude → {skill-name}` integrated header instead |

Skill invocation is the one exception: it is identified through the R007 integrated identification block (`┌─ Agent: claude → {skill-name}`), not a standalone R008 tool prefix.

Reference issue: #1321 (session 113 retrospective, 찐빠 #2 — AskUserQuestion prefix omitted twice).

## Example

```
[mgr-creator][sonnet] → Write: .claude/agents/new-agent.md
[secretary][opus] → Spawning:
  [1] lang-golang-expert:sonnet → Go code review
  [2] lang-python-expert:sonnet → Python code review
```

Parallel spawn description parameter:
```
Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert", ...)
Agent(description: "[2] Python code review", subagent_type: "lang-python-expert", ...)
```

## Multi-Turn Self-Check (MANDATORY)

매 도구 호출 직전, 이전 호출이 prefix 를 가졌는지에 의존하지 말고 다시 자가 점검:

1. 이 호출 위에 `[agent-name][model] → Tool: <tool-name>` 라인이 있는가?
2. agent-name 과 model 이 현재 컨텍스트와 일치하는가?
3. 이 호출에 도구 스키마상 required 파라미터가 모두 채워져 있는가? (예: AskUserQuestion 는 `questions` 배열이 비어 있지 않아야 함) prefix(announce)만 출력하고 실제 호출 payload 의 required 필드를 누락하면 안 된다.

체크 실패 시 즉시 prefix/필수 파라미터를 보완한 후 호출.

### Common Multi-Turn Violation

```
호출 1 (턴 1): [claude][sonnet] → Tool: Read ✓
호출 2 (턴 1, 같은 턴 추가 호출): (prefix 없음) ✗
호출 3 (턴 2 첫 호출): (prefix 없음) ✗
```

같은 턴 내 추가 호출, 새 턴 첫 호출 모두 prefix 필수.

Reference issue: #1096.

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

Reference issues: #1188 item #3, #1198 item #3.

### External-Project / Debugging Session Vigilance

R007 헤더와 마찬가지로, R008 prefix 누락도 외부 프로젝트 디버깅·배포 세션에서 가장 자주 발생한다. R007/R008은 세트로 함께 자가 점검한다.

| 세션 유형 | R008 prefix |
|-----------|-------------|
| oh-my-customcode 작업 | 필수 |
| 외부 프로젝트 디버깅 | **동일하게 필수** |
| SSH / 배포 / 인프라 작업 | **동일하게 필수** |

외부 프로젝트 진단 세션(#1417)에서 Bash/Edit/Read/Agent 모든 호출에 `[agent][model] → Tool:` prefix가 세션 전체 누락된 재발이 관측되었다 — 도구 호출 직전 prefix 부착을 워크플로에 내재화한다.

Reference issues: #1401, #1417.
