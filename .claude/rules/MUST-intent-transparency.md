# [MUST] Intent Transparency Rules

> **Priority**: MUST | **ID**: R015

## Core Rule

Display reasoning when routing to agents. Users must always know which agent was selected, why, and how to override.

## Display Format

```
[Intent Detected]
├── Input: "{user input}"
├── Agent: {detected-agent}
├── Confidence: {percentage}%
└── Reason: {explanation}
```

## Confidence Thresholds

| Confidence | Action |
|------------|--------|
| >= 90% | Auto-execute with display |
| 70-89% | Request confirmation, show alternatives |
| < 70% | List options for user to choose |

## Detection Factors — Weights: Keywords 40%, File patterns 30%, Action verbs 20%, Context 10%. See table via Read tool.

<!-- DETAIL: Detection Factors
| Factor | Weight | Examples |
|--------|--------|---------|
| Keywords | 40% | "Go", "Python", "리뷰" |
| File patterns | 30% | "*.go", "main.py" |
| Action verbs | 20% | "review", "create", "fix" |
| Context | 10% | Previous agent, working directory |
-->

## Override

Users can specify agent directly with `@{agent-name} {command}`. Override bypasses detection.

## User Directive Persistence — Named tool/skill/workflow preferences persist entire session. Anti-pattern: treating autonomous mode as clean slate. See full spec via Read tool.

<!-- DETAIL: User Directive Persistence
When a user explicitly names a tool, skill, or workflow (e.g., "use /pipeline auto-dev", "always run tests with bun test"), this preference persists for the entire session — including after autonomous mode transitions.

### Persistence Triggers

| User Statement Pattern | Persistence Scope |
|------------------------|-------------------|
| "use X for development" | Entire session |
| "always / every time" | Entire session |
| "from now on" | Entire session + memory save candidate |
| "for this task" | Current task only |
| Named slash command | Subsequent similar invocations |

### Cycle Start Self-Check

At the start of every work cycle (issue, task, release, or autonomous sub-loop):
1. Review recent user messages in the conversation
2. Identify any named tool/skill/workflow directives
3. Apply those directives unless explicitly rescinded
4. If unsure whether a directive applies, default to the stated preference

**Anti-pattern**: Treating autonomous mode as a clean slate that discards earlier user preferences. Autonomous mode means "continue without per-step confirmation" — NOT "reset user directives".

### Cross-reference

- Related memory: session v0.87.2~v0.88.0 (issue #869) — `/pipeline auto-dev` preference was lost after autonomous mode transition
-->

## Agent Triggers

Defined in `.claude/skills/intent-detection/patterns/agent-triggers.yaml`. Each agent has keywords, file patterns, actions, and base confidence.
