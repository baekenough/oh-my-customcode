# [MUST] Agent Identification Rules

> **Priority**: MUST | **ID**: R007

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

## Routing & Skill Context

When the orchestrator uses a routing skill, identification should reflect the active context:

```
┌─ Agent: claude (secretary-routing)
├─ Skill: secretary-routing
└─ Task: route agent management request
```

| Context | Identification |
|---------|---------------|
| No routing active | `claude (default)` |
| secretary-routing | `claude (secretary-routing)` |
| dev-lead-routing | `claude (dev-lead-routing)` |
| de-lead-routing | `claude (de-lead-routing)` |
| qa-lead-routing | `claude (qa-lead-routing)` |
| Skill invocation | `claude → {skill-name}` |

## Skill Invocation Format

When the orchestrator invokes a skill via the Skill tool, the skill name MUST be integrated into the identification block — NOT displayed as a separate tool call.

```
┌─ Agent: claude → {skill-name}
└─ Task: {brief-task-description}
```

### Common Violations

```
Incorrect: Skill as separate display
   ┌─ Agent: claude (default)
   └─ Task: research topic analysis

   Skill(research)    ← separate, disconnected

Correct: Skill integrated into identification
   ┌─ Agent: claude → research
   └─ Task: research topic analysis

Correct: With sub-skill
   ┌─ Agent: claude → research
   ├─ Skill: result-aggregation
   └─ Task: aggregate team findings
```

## When to Display

| Situation | Display |
|-----------|---------|
| Agent-specific task | Full header |
| Using skill | Include skill name |
| General conversation | "claude (default)" |
| Long tasks | Show progress with agent context |
| Skill invocation | Integrated `claude → {skill-name}` format |
