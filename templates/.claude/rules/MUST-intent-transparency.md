# [MUST] Intent Transparency Rules

> **Priority**: MUST - Required for user control
> **ID**: R015

## Purpose

Ensure transparency when automatically detecting user intent and routing to agents. Users should always understand why a specific agent was chosen.

## Detection Display (REQUIRED)

When intent is detected, display the reasoning:

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
| 70-89% | Request confirmation |
| < 70% | List options for user to choose |

## Detection Factors

Intent is detected using multiple factors:

```yaml
factors:
  keywords:
    weight: 40
    description: Language-specific keywords in input
    example: "Go", "Python", "리뷰", "생성"

  file_patterns:
    weight: 30
    description: File extensions mentioned or in context
    example: "*.go", "main.py"

  action_verbs:
    weight: 20
    description: Action words in user input
    example: "review", "create", "fix", "리뷰", "생성"

  context:
    weight: 10
    description: Recent conversation context
    example: Previous agent used, current working directory
```

## High Confidence Display (>= 90%)

```
[Intent Detected]
├── Input: "Go 코드 리뷰해줘"
├── Agent: lang-golang-expert
├── Confidence: 95%
└── Reason: "Go" keyword (40%) + "리뷰" action verb (55%)

Executing...
```

## Medium Confidence Display (70-89%)

```
[Intent Detected]
├── Input: "백엔드 코드 체크해줘"
├── Agent: be-go-backend-expert (?)
├── Confidence: 75%
└── Reason: "백엔드" keyword (40%) + "체크" action (35%)

Possible alternatives:
  1. be-go-backend-expert (75%)
  2. be-fastapi-expert (65%)
  3. be-springboot-expert (60%)

Proceed with be-go-backend-expert? [Y/n/1-3]
```

## Low Confidence Display (< 70%)

```
[Intent Unclear]
├── Input: "이 코드 좀 봐줘"
├── Confidence: < 70%
└── Need more context

Available agents for code review:
  1. lang-golang-expert (Go files)
  2. lang-python-expert (Python files)
  3. lang-typescript-expert (TypeScript files)
  4. lang-rust-expert (Rust files)

Which agent should review the code? [1-4]
```

## Override Syntax

Users can explicitly specify an agent:

```
@{agent-name} {command}
```

Examples:
```
@lang-golang-expert review this code
@lang-python-expert src/main.py 분석해줘
@secretary create a new agent
```

Override bypasses intent detection:

```
[Override] Agent explicitly specified: lang-python-expert
Executing...
```

## Implementation

### Secretary Workflow

```
1. Receive user input
2. Check for explicit override (@agent)
3. If no override:
   a. Extract keywords, file patterns, action verbs
   b. Match against agent triggers
   c. Calculate confidence score
   d. Display detection reasoning
   e. Execute or request confirmation based on threshold
4. Route to selected agent
```

### Detection Log

For debugging and transparency:

```yaml
detection_log:
  input: "Go 코드 리뷰해줘"
  extracted:
    keywords: ["Go"]
    file_patterns: []
    action_verbs: ["리뷰"]
  matches:
    - agent: lang-golang-expert
      score: 95
      breakdown:
        keyword_go: 40
        action_review: 40
        context: 15
  selected: lang-golang-expert
  confidence: 95%
```

## Agent Triggers

Each agent has defined triggers in:
`.claude/skills/intent-detection/patterns/agent-triggers.yaml`

```yaml
agents:
  lang-golang-expert:
    keywords: [go, golang, "go 언어"]
    file_patterns: ["*.go", "go.mod", "go.sum"]
    actions: [review, analyze, fix, optimize]
    base_confidence: 40

  lang-python-expert:
    keywords: [python, py, "파이썬"]
    file_patterns: ["*.py", "requirements.txt", "pyproject.toml"]
    actions: [review, analyze, fix, optimize]
    base_confidence: 40
```

## Benefits

1. **Transparency**: Users understand agent selection
2. **Control**: Users can override or choose alternatives
3. **Trust**: Clear reasoning builds user confidence
4. **Learning**: Users learn which agents handle what
5. **Debugging**: Clear logs for troubleshooting

## Violations

Proceeding without displaying intent reasoning = Rule violation

The user must always know:
- Which agent was selected
- Why it was selected
- What confidence level
- How to override if needed
