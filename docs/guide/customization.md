# Customization

oh-my-customcode is designed for full customization. You can create, modify, and extend agents, skills, and rules to fit your workflow.

## Creating Custom Agents

### Using the Creator Agent

The easiest way to create a new agent is using the built-in creator:

```bash
creator:agent my-custom-agent --type sw-engineer
```

### Manual Creation

Create a new directory in `agents/{category}/{agent-name}/`:

```
agents/sw-engineer/my-custom-agent/
├── AGENT.md       # Agent definition (required)
├── index.yaml     # Metadata (required)
└── refs/          # Symlinks to skills/guides (optional)
```

### AGENT.md Structure

```markdown
# My Custom Agent

> Expert in specific domain

## Role

Describe what this agent does and its expertise.

## Capabilities

- Capability 1
- Capability 2
- Capability 3

## Skills

References skills this agent uses:

- development/my-skill

## Workflow

1. Step 1
2. Step 2
3. Step 3
```

### index.yaml Structure

```yaml
metadata:
  name: my-custom-agent
  type: sw-engineer
  version: 1.0.0
  description: Short description

skills:
  - category: development
    name: my-skill

triggers:
  keywords: [mytech, myconcept]
  file_patterns: ["*.myext"]
```

## Modifying Rules

Rules are stored in `.claude/rules/` with priority prefixes:

| Prefix | Priority | Description |
|--------|----------|-------------|
| `MUST-` | Required | Never violate |
| `SHOULD-` | Recommended | Strongly encouraged |
| `MAY-` | Optional | Guidelines only |

### Editing Rules

Edit any rule file directly:

```bash
# Edit the safety rules
code .claude/rules/MUST-safety.md
```

### Creating New Rules

Create a new file with the appropriate prefix:

```markdown
# [MUST] My Custom Rule

> **Priority**: MUST - Never violate
> **ID**: R100

## Purpose

Describe why this rule exists.

## Requirements

### 1. First Requirement

```
Details about the requirement
```

### 2. Second Requirement

```
Details about the requirement
```
```

## Adding Custom Skills

Skills are stored in `skills/{category}/{skill-name}/`:

```
skills/development/my-skill/
├── SKILL.md       # Skill instructions (required)
└── index.yaml     # Metadata (required)
```

### SKILL.md Structure

```markdown
# My Custom Skill

> Skill for doing specific things

## Overview

What this skill provides.

## Instructions

### Step 1: Do This

Details and examples.

### Step 2: Do That

More details and examples.

## Best Practices

- Practice 1
- Practice 2
- Practice 3

## Anti-patterns

- What NOT to do
- Common mistakes
```

### index.yaml Structure

```yaml
metadata:
  name: my-skill
  category: development
  version: 1.0.0
  description: Skill description

applicable_to:
  - my-custom-agent
  - another-agent
```

## Customizing Workflows

### Pipeline Definitions

Pipelines define sequential workflows. Create in `pipelines/`:

```yaml
# pipelines/my-workflow.yaml
name: my-workflow
description: Custom workflow for my project

inputs:
  - name: target_file
    required: true

steps:
  - id: analyze
    agent: golang-expert
    action: analyze
    input: { file: "${target_file}" }
    output: analysis

  - id: review
    agent: qa-lead
    action: review
    input: { data: "${analysis}" }
    output: report
```

### Running Pipelines

```bash
pipeline:run my-workflow --input target_file=src/main.go
```

## Linking Skills to Agents

### Using Symlinks

Create symlinks in the agent's `refs/` directory:

```bash
cd agents/sw-engineer/my-agent/refs
ln -s ../../../../skills/development/my-skill my-skill
```

### Using index.yaml

Reference skills in the agent's `index.yaml`:

```yaml
skills:
  - category: development
    name: my-skill
    path: ../../../../skills/development/my-skill
```

## Customizing CLAUDE.md

The main `CLAUDE.md` file is the entry point for Claude. Customize it to:

- Add project-specific instructions
- Modify command references
- Change agent behavior
- Add custom sections

::: warning
Be careful when editing CLAUDE.md. Breaking changes may affect agent behavior.
:::

## Best Practices

### Agent Design

1. **Single Responsibility** - Each agent should have one clear purpose
2. **Clear Triggers** - Define keywords and file patterns for intent detection
3. **Skill References** - Link to skills instead of duplicating instructions

### Rule Design

1. **Prioritize Correctly** - Use MUST only when violation is unacceptable
2. **Be Specific** - Vague rules are hard to follow
3. **Include Examples** - Show correct and incorrect patterns

### Skill Design

1. **Reusable** - Skills should apply to multiple agents
2. **Complete** - Include all necessary instructions
3. **Versioned** - Track changes with version numbers

## Preserving Customizations

When running `omcustom update`, your customizations are preserved by default:

- Custom agents in new directories are kept
- Modified files are not overwritten
- New templates are added alongside existing ones

To force overwrite everything:

```bash
omcustom update --force
```

::: tip
Always use version control (git) so you can revert if needed.
:::
