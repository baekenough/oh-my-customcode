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
Incorrect: Calling tools without identification
   "먼저 JD 내용을 확인하겠습니다."
   <tool_call>WebFetch(...)</tool_call>

Incorrect: Missing model in identification
   [secretary] → Tool: WebFetch
   [secretary] → Fetching: https://example.com/jd.md

Correct: Always identify with agent AND model
   "먼저 JD 내용을 확인하겠습니다."
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: https://example.com/jd.md
   <tool_call>WebFetch(...)</tool_call>

Incorrect: Parallel calls without listing all identifications
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>

Correct: List all identifications with models, then call
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: url1
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: url2
   [secretary][opus] → Tool: Bash
   [secretary][opus] → Running: cmd
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>
```

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
