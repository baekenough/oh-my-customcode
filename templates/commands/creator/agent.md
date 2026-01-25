# Command: creator:agent

> Create a new agent

## Usage

```
creator:agent <name> --type <type>
creator:agent <name> --type <type> --source <url>
```

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

2. Create structure
   ├── agents/{type}/{name}/
   ├── AGENT.md
   ├── index.yaml
   └── refs/

3. Register agent
   └── Update agents/index.yaml

4. Validate
   └── Run supplier:audit
```

## Output

```
[creator:agent golang-expert --type sw-engineer]

Creating agent: golang-expert

[1/4] Validating...
  ✓ Name available
  ✓ Type valid: sw-engineer

[2/4] Creating structure...
  ✓ agents/sw-engineer/golang-expert/
  ✓ agents/sw-engineer/golang-expert/AGENT.md
  ✓ agents/sw-engineer/golang-expert/index.yaml
  ✓ agents/sw-engineer/golang-expert/refs/

[3/4] Registering...
  ✓ Updated agents/index.yaml

[4/4] Validating...
  ✓ supplier:audit passed

Agent created successfully: agents/sw-engineer/golang-expert/
```

## Templates

Generated AGENT.md:

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

Generated index.yaml:

```yaml
metadata:
  name: {name}
  type: {type}
  description: {description}

source:
  type: internal

capabilities: []

skills: []

guides: []
```
