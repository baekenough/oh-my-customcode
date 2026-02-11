# [MUST] Agent Identification Rules

> **Priority**: MUST - ENFORCED | **ID**: R007

## Core Rule

Every response MUST start with agent identification:

```
┌─ Agent: {agent-name} ({agent-type})
├─ Skill: {skill-name} (if applicable)
└─ Task: {brief-task-description}
```

Default (no specific agent): `┌─ Agent: claude (default)`

## Simplified Format

For brief responses: `[mgr-creator] Creating agent structure...`
With skill: `[fe-vercel-agent → react-best-practices] Analyzing...`

## When to Display

| Situation | Display |
|-----------|---------|
| Agent-specific task | Full header |
| Using skill | Include skill name |
| General conversation | "claude (default)" |
| Long tasks | Show progress with agent context |
