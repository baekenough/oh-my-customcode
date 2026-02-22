# Rules Reference

Rules define coding standards, workflow patterns, and agent behavior. oh-my-customcode includes 18 pre-built rules.

## Overview

| Priority | Count | Purpose |
|----------|-------|---------|
| MUST | 12 | Required - never violate |
| SHOULD | 5 | Recommended - strongly encouraged |
| MAY | 1 | Optional - guidelines |

## MUST Rules

MUST rules are required and should never be violated.

### MUST-language-policy

**ID**: R000

Language and delegation policy:

- User input in Korean
- Output in Korean for user communication
- Code and file contents in English
- Delegation model for file operations

### MUST-safety

**ID**: R001

Safety rules for agent operations:

- No exposure of secrets/API keys
- No system file modifications
- No dangerous command execution
- Required checks before destructive operations

### MUST-permissions

**ID**: R002

Permission rules for tool usage:

- Tier 1: Always allowed (Read, Glob, Grep)
- Tier 2: Default allowed (Write, Edit)
- Tier 3: Requires approval (Bash, WebFetch)
- Tier 4: Explicit request only (Task)

### MUST-agent-design

**ID**: R006

Agent structure requirements:

- Required files (AGENT.md, index.yaml)
- Separation of concerns
- Linking patterns
- Naming conventions

### MUST-agent-identification

**ID**: R007

Agent identification in responses:

- Every response must start with agent identification
- Format: Agent name, type, and task
- No exceptions

### MUST-tool-identification

**ID**: R008

Tool usage identification:

- Every tool call must be prefixed with agent
- Format: `[agent-name] -> Tool: <tool-name>`
- Clear tracking of operations

### MUST-parallel-execution

**ID**: R009

Parallel execution requirements:

- Independent tasks must run in parallel
- Maximum 4 parallel instances
- Large tasks must be decomposed

### MUST-orchestrator-coordination

**ID**: R010

Orchestrator coordination:

- Multi-agent tasks require orchestrator
- Orchestrators must not execute work directly
- Clear delegation patterns

### MUST-intent-transparency

**ID**: R015

Intent detection transparency:

- Display reasoning when auto-routing
- Confidence thresholds for confirmation
- Override syntax for explicit routing

### MUST-continuous-improvement

**ID**: R016

Continuous improvement:

- Update rules when violations occur
- Learn from feedback
- Document changes

### MUST-sync-verification

**ID**: R017

Synchronization verification:

- Verify component consistency
- Check documentation sync
- Report discrepancies

### MUST-agent-teams

**ID**: R018

Agent Teams integration (conditional - when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`):

- Mandatory use of Agent Teams for qualifying coordinated tasks
- Decision matrix for Task tool vs Agent Teams
- Team composition patterns
- Graceful fallback to Task tool when disabled

## SHOULD Rules

SHOULD rules are strongly recommended but may have exceptions.

### SHOULD-interaction

**ID**: R003

Interaction guidelines:

- Brevity in responses
- Clarity in instructions
- Transparency about actions
- Status report format

### SHOULD-error-handling

**ID**: R004

Error handling patterns:

- Error classification (Warning, Error, Critical)
- Error report format
- Recovery strategies
- Preventive validation

### SHOULD-memory-integration

**ID**: R011

Memory integration with claude-mem:

- Save before compaction
- Restore on session start
- Project isolation
- Query patterns

### SHOULD-hud-statusline

**ID**: R012

HUD statusline display:

- Real-time status information
- Progress tracking
- Update triggers
- Component format

### SHOULD-ecomode

**ID**: R013

Ecomode for efficiency:

- Compact output format
- Aggregation patterns
- Result compression
- Activation conditions

## MAY Rules

MAY rules are optional guidelines.

### MAY-optimization

**ID**: R005

Optimization guidelines:

- Parallel processing when appropriate
- Caching strategies
- Lazy loading
- Token optimization

## Rule Structure

Rules follow this structure:

```markdown
# [PRIORITY] Rule Name

> **Priority**: MUST/SHOULD/MAY
> **ID**: R0XX

## Purpose

Why this rule exists.

## Requirements

### 1. First Requirement

Details and examples.

### 2. Second Requirement

Details and examples.

## Examples

Good and bad patterns.
```

## Rule Locations

Rules are stored in `.claude/rules/`:

```
.claude/rules/
├── MUST-language-policy.md
├── MUST-safety.md
├── MUST-permissions.md
├── MUST-agent-design.md
├── MUST-agent-identification.md
├── MUST-tool-identification.md
├── MUST-parallel-execution.md
├── MUST-orchestrator-coordination.md
├── MUST-intent-transparency.md
├── MUST-continuous-improvement.md
├── MUST-sync-verification.md
├── MUST-agent-teams.md
├── SHOULD-interaction.md
├── SHOULD-error-handling.md
├── SHOULD-memory-integration.md
├── SHOULD-hud-statusline.md
├── SHOULD-ecomode.md
└── MAY-optimization.md
```

## Modifying Rules

Edit rules directly or create new ones:

```bash
# Edit existing rule
code .claude/rules/MUST-safety.md

# Create new rule
code .claude/rules/SHOULD-my-rule.md
```

## Rule Enforcement

- MUST rules are enforced by agents
- SHOULD rules trigger warnings if violated
- MAY rules are suggestions only

See [Customization](/guide/customization) for creating your own rules.
