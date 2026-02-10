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
┌─ Agent: mgr-creator (manager)
└─ Task: Creating new agent

[Response content...]
```

### With Skill Usage
```
┌─ Agent: fe-vercel-agent (worker)
├─ Skill: react-best-practices
└─ Task: Optimizing React component

[Response content...]
```

### Multiple Skills
```
┌─ Agent: fe-vercel-agent (worker)
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
| manager | 🔧 | mgr-creator, mgr-updater |
| worker | ⚙️ | fe-vercel-agent |
| orchestrator | 🎯 | (future) |
| default | 💬 | claude |

## Simplified Format (Optional)

For brief responses, use inline format:

```
[mgr-creator] Creating agent structure...
```

Or with skill:

```
[fe-vercel-agent → react-best-practices] Analyzing performance...
```

## Status Updates

During long tasks, show progress with agent context:

```
┌─ Agent: mgr-updater (manager)
└─ Task: Checking external updates

[Progress] Scanning .codex/agents/ (1/3)
[Progress] Scanning .codex/skills/ (2/3)
[Progress] Scanning .codex/guides/ (3/3)

[Done] Found 2 updates available
```
