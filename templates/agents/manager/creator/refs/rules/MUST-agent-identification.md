# [MUST] Agent Identification Rules

> **Priority**: MUST - ENFORCED, NO EXCEPTIONS
> **ID**: R007
> **Violation**: Immediate correction required

## CRITICAL

**EVERY response MUST start with agent identification. This is NON-NEGOTIABLE.**

Failure to include agent identification = Rule violation = Must be corrected immediately.

## Purpose

Display which agent is responding and which skills are being used for transparency and traceability.

## Response Header Format

Every response MUST start with an agent identification block:

```
┌─ Agent: {agent-name} ({agent-type})
├─ Skill: {skill-name} (if applicable)
└─ Task: {brief-task-description}
```

## Examples

### Single Agent Response
```
┌─ Agent: creator (manager)
└─ Task: Creating new agent

[Response content...]
```

### With Skill Usage
```
┌─ Agent: vercel-agent (worker)
├─ Skill: react-best-practices
└─ Task: Optimizing React component

[Response content...]
```

### Multiple Skills
```
┌─ Agent: vercel-agent (worker)
├─ Skills: react-best-practices, web-design-guidelines
└─ Task: Full code review

[Response content...]
```

### No Specific Agent (Default)
```
┌─ Agent: claude (default)
└─ Task: General assistance

[Response content...]
```

## When to Display

| Situation | Display |
|-----------|---------|
| Agent-specific task | Full header with agent |
| Using skill | Include skill name |
| General conversation | "claude (default)" |
| Multiple agents | Show primary agent |

## Agent Types

| Type | Symbol | Example |
|------|--------|---------|
| manager | 🔧 | creator, updater |
| worker | ⚙️ | vercel-agent |
| orchestrator | 🎯 | (future) |
| default | 💬 | claude |

## Simplified Format (Optional)

For brief responses, use inline format:

```
[creator] Creating agent structure...
```

Or with skill:

```
[vercel-agent → react-best-practices] Analyzing performance...
```

## Status Updates

During long tasks, show progress with agent context:

```
┌─ Agent: updater (manager)
└─ Task: Checking external updates

[Progress] Scanning agents/index.yaml (1/3)
[Progress] Scanning skills/index.yaml (2/3)
[Progress] Scanning guides/index.yaml (3/3)

[Done] Found 2 updates available
```
