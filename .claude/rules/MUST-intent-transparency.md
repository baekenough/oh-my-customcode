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

## User Directive Persistence — Named tool/skill/workflow preferences persist entire session. Anti-pattern: treating autonomous mode as clean slate or re-asking already-rejected questions. See full spec via Read tool.

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
| AskUserQuestion rejected / directive overridden | That question/approach must NOT recur this session |

### Cycle Start Self-Check (MANDATORY)

At the start of every new task, issue, or autonomous sub-loop, answer these three questions before proceeding:

1. **Preferred tool/skill/workflow?** — Did the user explicitly name a tool or workflow earlier in this session? If YES, use it. Do NOT fall back to the default without re-confirmation.
2. **Rejected interaction patterns?** — Did the user reject a question format (e.g., AskUserQuestion) or specific approach? If YES, that pattern must NOT recur in this session.
3. **Override rescinded?** — Has the user explicitly cancelled a prior directive since stating it? If NO, the directive is still active.

| Check | Fail Condition | Required Action |
|-------|---------------|----------------|
| Preferred tool/skill | About to use a different tool/skill | Switch to user-specified one |
| Rejected AskUserQuestion | About to AskUserQuestion again on same topic | Answer with best judgment or inline question (free text) |
| Rejected approach | About to repeat the same approach | Choose alternative approach |

**Anti-pattern 1**: Treating autonomous mode as a clean slate that discards earlier user preferences. Autonomous mode means "continue without per-step confirmation" — NOT "reset user directives".

**Anti-pattern 2**: User rejects an AskUserQuestion (or the interaction style) → agent falls back to free-text phrasing of the same question in the next turn. If the user has indicated they do not want a specific interaction pattern, do NOT re-ask via different formatting — make a judgment call and proceed.

### Cross-reference

- Related memory: session v0.87.2~v0.88.0 (issue #869) — `/pipeline auto-dev` preference was lost after autonomous mode transition
- Related issue: #1188 item #4 — AskUserQuestion rejected, agent re-asked via free text in next turn (2026-05-19)
-->

## Agent Triggers

Defined in `.claude/skills/intent-detection/patterns/agent-triggers.yaml`. Each agent has keywords, file patterns, actions, and base confidence.
