---
name: create-agent
description: Create a new agent with complete structure
argument-hint: "<name> --type <type>"
disable-model-invocation: true
---

# Create Agent Skill

Create a new agent with complete directory structure, files, and registration.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | yes | Agent name (kebab-case) |

## Options

```
--type, -t       Agent type (required)
                 Values: sw-engineer, sw-engineer/backend, infra-engineer, manager
--source, -s     External source URL (for external agents)
--desc, -d       Description
--skills         Comma-separated skills to include
```

## Workflow

```
1. Validate input
   ├── Name is unique
   ├── Name is kebab-case
   └── Type is valid

2. Create agent file
   └── .claude/agents/{name}.md

4. Validate
   └── Run mgr-supplier:audit
```

## Templates

### Agent File Template

```markdown
# {Name} Agent

> **Type**: {Type}
> **Source**: Internal

## Purpose

{Description}

## Capabilities

1.
2.

## Skills

| Skill | Purpose |
|-------|---------|

## Guides

| Guide | Purpose |
|-------|---------|
```

## Output Format

```
[mgr-creator:agent lang-golang-expert --type sw-engineer]

Creating agent: lang-golang-expert

[1/4] Validating...
  ✓ Name available
  ✓ Type valid: sw-engineer

[2/4] Creating agent file...
  ✓ .claude/agents/lang-golang-expert.md

[3/4] Validating...
  ✓ mgr-supplier:audit passed

Agent created successfully: .claude/agents/lang-golang-expert.md
```
