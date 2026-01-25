# Command: intent:explain

> Explain how intent detection works and show current triggers

## Usage

```
intent:explain
intent:explain <agent>
intent:explain --triggers
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| agent | string | no | Show triggers for specific agent |

## Options

```
--triggers, -t   Show all agent triggers
--test, -T       Test intent detection with a sample input
--verbose, -v    Show detailed scoring breakdown
```

## Output

### Basic Explanation

```
[intent:explain]

## Intent Detection System

Intent detection automatically routes your requests to the appropriate agent.

### How It Works

1. **Extract** keywords, file patterns, and action verbs from your input
2. **Match** against agent triggers (weights: keyword 40%, file 30%, action 20%, context 10%)
3. **Calculate** confidence score
4. **Route** based on confidence:
   - >= 90%: Auto-execute
   - 70-89%: Request confirmation
   - < 70%: List options

### Override

Use `@agent-name` to explicitly specify an agent:
```
@python-expert review api.py
```

### Available Agents

| Agent | Keywords | File Patterns |
|-------|----------|---------------|
| golang-expert | go, golang | *.go |
| python-expert | python, py | *.py |
| ... | ... | ... |

Use `intent:explain --triggers` for full trigger list.
```

### Agent-Specific

```
[intent:explain golang-expert]

## golang-expert Triggers

Keywords:
  Korean: 고, 고랭, go 언어
  English: go, golang

File Patterns:
  *.go, go.mod, go.sum

Supported Actions:
  review, fix, refactor, explain

Base Confidence: 40%

Example matches:
  "Go 코드 리뷰해줘" → 95% confidence
  "main.go 확인해줘" → 90% confidence
  "고랭 에러 수정" → 85% confidence
```

### Test Mode

```
[intent:explain --test]

Enter test input: Go 코드 리뷰해줘

[Detection Result]
├── Input: "Go 코드 리뷰해줘"
├── Extracted:
│   ├── Keywords: ["Go"]
│   ├── Actions: ["리뷰"]
│   └── Files: []
├── Matches:
│   ├── golang-expert: 95%
│   │   └── keyword "Go" (40) + action "리뷰" (40) + base (15)
│   ├── go-backend-expert: 55%
│   │   └── keyword partial (20) + action "리뷰" (20) + base (15)
│   └── other agents: < 30%
└── Selected: golang-expert (95%)

Would execute: golang-expert → code review
```

### Full Triggers

```
[intent:explain --triggers]

## All Agent Triggers

### SW Engineers

**golang-expert**
  Keywords: go, golang, 고, 고랭
  Files: *.go, go.mod, go.sum
  Actions: review, fix, refactor, explain

**python-expert**
  Keywords: python, py, 파이썬
  Files: *.py, requirements.txt, pyproject.toml
  Actions: review, fix, refactor, explain

... [continues for all agents]
```

## Agent

Executed by: **secretary** (orchestrator)

## Related Commands

- `@agent-name {command}` - Override intent detection
- `lists` - Show all available agents
