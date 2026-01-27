# [MUST] Tool Usage Identification Rules

> **Priority**: MUST - ENFORCED, NO EXCEPTIONS
> **ID**: R008
> **Violation**: Immediate correction required

## CRITICAL

**EVERY tool call MUST be prefixed with agent and model identification. This is NON-NEGOTIABLE.**

```
Before EVERY tool call, output:
[agent-name][model] → Tool: <tool-name>
[agent-name][model] → Target: <file/path/url>
```

Failure to identify tool usage = Rule violation = Must be corrected immediately.

### Self-Check Before EVERY Tool Call

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE INVOKING ANY TOOL, ASK YOURSELF:                         ║
║                                                                   ║
║  1. Did I output the tool identification line with MODEL?        ║
║     [agent-name][model] → Tool: <tool-name>                      ║
║     [agent-name][model] → Target: <target>                       ║
║                                                                   ║
║  2. Am I about to call multiple tools in parallel?               ║
║     → EACH tool needs its own identification line                ║
║     → List all identifications BEFORE the tool calls             ║
║                                                                   ║
║  If NO to #1 → STOP. Output identification FIRST.                ║
╚══════════════════════════════════════════════════════════════════╝
```

### Model Values

| Model | When to Use |
|-------|-------------|
| `opus` | Complex reasoning, architecture design |
| `sonnet` | General tasks, code generation (default) |
| `haiku` | Fast simple tasks, file search |

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
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: https://example.com/jd.md
   <tool_call>WebFetch(...)</tool_call>

❌ WRONG: Parallel calls without listing all identifications
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>

✓ CORRECT: List all identifications with models, then call
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

## Purpose

Display which agent is using which tool for transparency and debugging. This extends R007 (Agent Identification) to cover tool operations.

## Tool Usage Format

When invoking a tool, prefix with agent and model identification:

```
[agent-name][model] → Tool: <tool-name>
```

### Examples

```
[golang-expert][sonnet] → Tool: Read
[golang-expert][sonnet] → Reading: src/main.go

[supplier][haiku] → Tool: Glob
[supplier][haiku] → Searching: agents/**/index.yaml

[creator][sonnet] → Tool: Write
[creator][sonnet] → Writing: agents/sw-engineer/new-agent/AGENT.md
```

## Extended Format (Verbose)

For detailed tracking:

```
┌─ Agent: golang-expert (sw-engineer)
├─ Model: sonnet
├─ Skill: go-best-practices
├─ Tool: Read
└─ Target: src/main.go
```

## Tool Categories

| Category | Tools | Format |
|----------|-------|--------|
| File Read | Read, Glob, Grep | `→ Reading:` / `→ Searching:` |
| File Write | Write, Edit | `→ Writing:` / `→ Editing:` |
| Network | WebFetch | `→ Fetching:` |
| Execution | Bash, Task | `→ Running:` / `→ Spawning:` |

## When to Display

| Situation | Display |
|-----------|---------|
| Reading files | Agent + file path |
| Writing files | Agent + file path |
| Searching | Agent + pattern |
| Fetching URLs | Agent + URL |
| Running commands | Agent + command |

## Simplified Format

For inline operations:

```
[supplier][haiku] → Glob: agents/**/index.yaml
[creator][sonnet] → Write: agents/sw-engineer/new-agent/AGENT.md
[updater][sonnet] → WebFetch: https://github.com/...
```

## Integration with R007

R008 extends R007 for tool operations:

```
┌─ Agent: creator (manager)
├─ Model: sonnet
└─ Task: Creating new agent

[creator][sonnet] → Write: agents/sw-engineer/new-agent/AGENT.md
[creator][sonnet] → Write: agents/sw-engineer/new-agent/index.yaml
[creator][sonnet] → Edit: agents/index.yaml

[Done] Agent created successfully
```

## Benefits

1. **Debugging**: Know which agent performed which operation
2. **Transparency**: User sees all agent activities
3. **Audit Trail**: Track file changes by agent
4. **Error Attribution**: Identify which agent caused issues

## Implementation

Agents should:
1. Identify themselves before tool operations
2. Include tool name and target
3. Use consistent format across all tools
4. Group related operations together
