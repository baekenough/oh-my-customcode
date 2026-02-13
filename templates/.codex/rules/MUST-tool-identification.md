# [MUST] Tool Usage Identification Rules

> **Priority**: MUST - ENFORCED | **ID**: R008

## Core Rule

Every tool call MUST be prefixed with agent and model identification:

```
[agent-name][model] → Tool: <tool-name>
[agent-name][model] → Target: <file/path/url>
```

For parallel calls: list ALL identifications BEFORE the tool calls.

### Common Violations to Avoid

```
❌ WRONG: Calling tools without identification
   "먼저 JD 내용을 확인하겠습니다."
   <tool_call>WebFetch(...)</tool_call>

❌ WRONG: Missing model in identification
   [secretary] → Tool: WebFetch
   [secretary] → Fetching: https://example.com/jd.md

✓ CORRECT: Always identify with agent AND model
   "먼저 JD 내용을 확인하겠습니다."
   [secretary][reasoning] → Tool: WebFetch
   [secretary][reasoning] → Fetching: https://example.com/jd.md
   <tool_call>WebFetch(...)</tool_call>

❌ WRONG: Parallel calls without listing all identifications
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>

✓ CORRECT: List all identifications with models, then call
   [secretary][reasoning] → Tool: WebFetch
   [secretary][reasoning] → Fetching: url1
   [secretary][reasoning] → Tool: WebFetch
   [secretary][reasoning] → Fetching: url2
   [secretary][reasoning] → Tool: Bash
   [secretary][reasoning] → Running: cmd
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>
```

## Models

| Model | Use |
|-------|-----|
| `reasoning` | Complex reasoning, architecture |
| `balanced` | General tasks, code generation (default) |
| `fast` | Fast simple tasks, file search |

## Tool Categories

| Category | Tools | Verb |
|----------|-------|------|
| File Read | Read, Glob, Grep | Reading / Searching |
| File Write | Write, Edit | Writing / Editing |
| Network | WebFetch | Fetching |
| Execution | Bash, Task | Running / Spawning |

## Task Tool Format

```
Task(subagent_type):model → description
```

`subagent_type` MUST match actual Task tool parameter. Custom names not allowed.

## Example

```
[mgr-creator][balanced] → Write: .codex/agents/new-agent.md
[secretary][reasoning] → Spawning:
  [1] Task(lang-golang-expert):balanced → Go code review
  [2] Task(lang-python-expert):balanced → Python code review
```
