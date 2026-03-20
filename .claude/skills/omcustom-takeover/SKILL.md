---
name: omcustom-takeover
description: Extract canonical spec from existing agent or skill files
scope: harness
user-invocable: true
argument-hint: "<agent-name>"
---

# Takeover Skill

Extract a canonical specification from an existing agent or skill file. Inspired by codespeak.dev's reverse compilation concept — deriving specs from existing implementations.

## Purpose

When an agent or skill has evolved organically without a formal spec, `takeover` reverse-engineers a structured specification that captures its intent, invariants, workflow contract, and I/O contract.

## Usage

```
/omcustom-takeover <agent-name>
/omcustom-takeover <skill-name>
```

## Workflow

### Phase 1: Read Target

```
1. Determine target type:
   - Agent: read .claude/agents/<name>.md
   - Skill: read .claude/skills/<name>/SKILL.md
2. Parse frontmatter (YAML metadata)
3. Parse body (markdown content)
```

### Phase 2: Extract Spec Components

Extract these components from the target:

| Component | Source | Description |
|-----------|--------|-------------|
| `intent` | Description field + first paragraph | One-line purpose statement |
| `invariants` | Rules referenced, constraints mentioned | Things that must always be true |
| `workflow_contract` | Workflow/stages sections | Input → processing → output steps |
| `io_contract` | Tools field, input/output patterns | What the agent consumes and produces |
| `dependencies` | Skills field, guide references | External knowledge required |
| `boundaries` | Limitations field, disallowedTools | What the agent explicitly cannot do |

### Phase 3: Generate Spec

Output structured spec to `.claude/specs/<name>.spec.md`:

```markdown
---
name: <name>
type: agent | skill
source: .claude/agents/<name>.md | .claude/skills/<name>/SKILL.md
generated: <ISO-8601 timestamp>
---

# Spec: <name>

## Intent
<one-line purpose>

## Invariants
- <rule or constraint that must always hold>
- ...

## Workflow Contract
### Input
<what the agent/skill receives>

### Processing
1. <step>
2. <step>

### Output
<what the agent/skill produces>

## I/O Contract
### Consumes
- Tools: [<tools used>]
- Files: [<files read>]
- MCP: [<MCP tools if any>]

### Produces
- Files: [<files created/modified>]
- Output: [<what is returned>]

## Dependencies
- Skills: [<referenced skills>]
- Guides: [<referenced guides>]
- Rules: [<rules enforced>]

## Boundaries
- <what the agent explicitly cannot do>
```

### Phase 4: Report

```
[Done] Spec extracted: .claude/specs/<name>.spec.md
├── Intent: <summary>
├── Invariants: <count> rules
├── Workflow: <step count> steps
└── Dependencies: <count> refs
```

## Notes

- Specs are git-untracked (under `.claude/`)
- Regenerate anytime with `/omcustom-takeover <name>`
- Used by `/dev-refactor --spec` for invariant-preserving refactoring
- Advisory output — human review recommended before using as contract
