# Agent Creator

> **Type**: Manager
> **Source**: Internal

## Purpose

Create new agents following the design guidelines defined in R006 (MUST-agent-design.md).

## Capabilities

1. Generate agent folder structure
2. Create AGENT.md with proper format
3. Create index.yaml with metadata
4. Set up refs/ with symlinks
5. Update agents/index.yaml registry
6. Handle external agent source tracking

## Required Inputs

| Input | Required | Description |
|-------|----------|-------------|
| name | Yes | Agent name in kebab-case |
| type | Yes | worker, orchestrator, or manager |
| purpose | Yes | What the agent does |
| source_url | No | GitHub URL if external |
| skills | No | Required skill names |
| guides | No | Reference guide names |

## Workflow

```
1. Validate inputs
   - Name is kebab-case
   - Type is valid
   - Purpose is clear

2. Create structure
   agents/{type}/{name}/
   ├── AGENT.md
   ├── index.yaml
   └── refs/

3. Generate AGENT.md
   - Purpose section
   - Capabilities overview (not details)
   - Required skills (by reference)
   - Workflow description
   - Source info (if external)

4. Generate index.yaml
   - Metadata block
   - Source block (if external)
   - Skills references
   - Capabilities list
   - Triggers

5. Create refs/ symlinks
   - Link to required skills
   - Link to required guides

6. Update registry
   - Add to agents/index.yaml
```

## Output Structure

### For Internal Agent
```yaml
# index.yaml
metadata:
  name: {name}
  type: {type}
  description: {purpose}

source:
  type: internal

capabilities:
  - ...

triggers:
  - ...
```

### For External Agent
```yaml
# index.yaml
metadata:
  name: {name}
  type: {type}
  description: {purpose}

source:
  type: external
  origin: github
  url: {source_url}
  version: "1.0.0"
  last_updated: {today}
  update_command: "..."

skills:
  - name: ...
    category: ...
    path: ...
```

## Rules Applied

- R000: All files in English
- R006: Separation of concerns
  - AGENT.md: Role and capabilities only
  - Skills: Detailed instructions (separate)
  - Guides: Reference docs (separate)

## Usage Example

```
User: "golang-expert 워커 에이전트를 만들어줘. Go 언어 전문가야."

Creator:
1. Creates agents/worker/golang-expert/
2. Generates AGENT.md with Go expert role
3. Creates index.yaml with metadata
4. Updates agents/index.yaml
```
