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

체크 실패 시 즉시 prefix 추가 후 호출.

### Common Multi-Turn Violation

```
호출 1 (턴 1): [claude][sonnet] → Tool: Read ✓
호출 2 (턴 1, 같은 턴 추가 호출): (prefix 없음) ✗
호출 3 (턴 2 첫 호출): (prefix 없음) ✗
```

같은 턴 내 추가 호출, 새 턴 첫 호출 모두 prefix 필수.

Reference issue: #1096.
