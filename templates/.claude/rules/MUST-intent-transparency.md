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

## Detection Factors

| Factor | Weight | Examples |
|--------|--------|---------|
| Keywords | 40% | "Go", "Python", "리뷰" |
| File patterns | 30% | "*.go", "main.py" |
| Action verbs | 20% | "review", "create", "fix" |
| Context | 10% | Previous agent, working directory |

## Override

Users can specify agent directly with `@{agent-name} {command}`. Override bypasses detection.

## Agent Triggers

Defined in `.claude/skills/intent-detection/patterns/agent-triggers.yaml`. Each agent has keywords, file patterns, actions, and base confidence.
