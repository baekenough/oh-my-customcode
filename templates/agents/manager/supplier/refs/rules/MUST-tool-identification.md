# [MUST] Tool Usage Identification Rules

> **Priority**: MUST - ENFORCED, NO EXCEPTIONS
> **ID**: R008
> **Violation**: Immediate correction required

## CRITICAL

**EVERY tool call MUST be prefixed with agent identification. This is NON-NEGOTIABLE.**

```
Before EVERY tool call, output:
[agent-name] → Tool: <tool-name>
[agent-name] → Target: <file/path/url>
```

Failure to identify tool usage = Rule violation = Must be corrected immediately.

## Purpose

Display which agent is using which tool for transparency and debugging. This extends R007 (Agent Identification) to cover tool operations.

## Tool Usage Format

When invoking a tool, prefix with agent identification:

```
[agent-name] → Tool: <tool-name>
```

### Examples

```
[golang-expert] → Tool: Read
[golang-expert] → Reading: src/main.go

[supplier] → Tool: Glob
[supplier] → Searching: agents/**/index.yaml

[creator] → Tool: Write
[creator] → Writing: agents/sw-engineer/new-agent/AGENT.md
```

## Extended Format (Verbose)

For detailed tracking:

```
┌─ Agent: golang-expert (sw-engineer)
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
[supplier → Glob] agents/**/index.yaml
[creator → Write] agents/sw-engineer/new-agent/AGENT.md
[updater → WebFetch] https://github.com/...
```

## Integration with R007

R008 extends R007 for tool operations:

```
┌─ Agent: creator (manager)
└─ Task: Creating new agent

[creator → Write] agents/sw-engineer/new-agent/AGENT.md
[creator → Write] agents/sw-engineer/new-agent/index.yaml
[creator → Edit] agents/index.yaml

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
