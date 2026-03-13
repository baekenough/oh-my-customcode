---
name: multi-model-verification
description: Parallel code verification using multiple models with severity classification
scope: core
version: 1.0.0
user-invocable: false
---

# Multi-Model Verification

Parallel code verification using multiple AI models for comprehensive quality assurance. Each model focuses on a different aspect, and results are aggregated with severity classification.

## Background

Inspired by Pi Coding Agent Workflow Extension's multi-model verification pattern. Instead of a single reviewer, multiple models verify code simultaneously, each with specialized focus areas.

## Verification Roles

| Model | Role | Focus Areas |
|-------|------|-------------|
| `opus` | Architecture Reviewer | Design patterns, separation of concerns, extensibility, security architecture |
| `sonnet` | Code Quality Reviewer | Logic correctness, error handling, edge cases, performance patterns |
| `haiku` | Style & Convention Reviewer | Naming conventions, formatting, documentation, code organization |

## Severity Classification

| Severity | Description | Action Required |
|----------|-------------|-----------------|
| CRITICAL | Bugs, security vulnerabilities, data loss risks | Must fix before merge |
| WARNING | Code smells, suboptimal patterns, missing error handling | Should fix, justify if skipped |
| INFO | Style suggestions, minor improvements, alternative approaches | Optional improvement |

## Workflow

### Prerequisites
- Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) for full parallel execution
- Falls back to sequential Agent tool execution if Agent Teams unavailable

### Execution Flow

1. **Input**: File path(s) or diff to verify
2. **Spawn Parallel Reviewers**:
   - `Agent(opus)` → Architecture & design review
   - `Agent(sonnet)` → Code quality & correctness review
   - `Agent(haiku)` → Style & convention review
3. **Collect Results**: Each reviewer returns findings with severity
4. **Aggregate**: Merge and deduplicate findings
5. **Report**: Unified report sorted by severity

### Agent Teams Mode

When Agent Teams is available, create a verification team:

```
TeamCreate("verification-team")
├── architect-reviewer (opus) → Architecture review
├── quality-reviewer (sonnet) → Code quality review
└── style-reviewer (haiku) → Style review
```

Members communicate findings via SendMessage for cross-cutting concerns.

### Agent Tool Fallback

When Agent Teams is unavailable, spawn parallel agents:

```
[1] Agent(general-purpose):opus → Architecture review
[2] Agent(general-purpose):sonnet → Code quality review
[3] Agent(general-purpose):haiku → Style & convention review
```

## Output Format

```
## Multi-Model Verification Report

### Summary
- Files reviewed: {count}
- Findings: {critical} CRITICAL, {warning} WARNING, {info} INFO
- Reviewers: opus (architecture), sonnet (quality), haiku (style)

### CRITICAL
[opus] {file}:{line} — {description}
[sonnet] {file}:{line} — {description}

### WARNING
[sonnet] {file}:{line} — {description}
[haiku] {file}:{line} — {description}

### INFO
[haiku] {file}:{line} — {description}

### Consensus
Issues flagged by 2+ reviewers:
- {file}:{line} — {description} (flagged by: opus, sonnet)
```

## Integration

- Works with `dev-review` skill as an enhanced verification mode
- Integrates with `structured-dev-cycle` skill at the "Verify Implementation" stage
- Compatible with R009 (parallel execution) and R018 (Agent Teams) rules

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `models` | `[opus, sonnet, haiku]` | Models to use for verification |
| `severity_filter` | `all` | Minimum severity to report (`critical`, `warning`, `all`) |
| `consensus_threshold` | `2` | Number of reviewers needed for consensus flag |
| `include_suggestions` | `true` | Include INFO-level suggestions |

## When to Use

| Scenario | Recommended |
|----------|-------------|
| Pre-merge review of critical code | Yes |
| Architecture changes | Yes |
| Security-sensitive code | Yes |
| Simple formatting changes | No (use single reviewer) |
| Rapid prototyping | No (overhead too high) |

## Cost Awareness

Multi-model verification uses 3x the tokens of a single review. Reserve for:
- Critical path code changes
- Security-sensitive modifications
- Architecture decisions
- Pre-release verification
