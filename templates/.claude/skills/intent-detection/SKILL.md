---
name: intent-detection
description: Automatically detect user intent and route to appropriate agent
user-invocable: false
---

## Purpose

Automatically detect user intent and route to the appropriate agent with full transparency.

## Detection Algorithm

### 1. Input Analysis

```
User Input: "Go 코드 리뷰해줘"
            │
            ▼
┌─────────────────────────────┐
│  Tokenize & Extract         │
├─────────────────────────────┤
│  Keywords: ["Go"]           │
│  Actions: ["리뷰"]          │
│  File refs: []              │
│  Context: []                │
└─────────────────────────────┘
```

### 2. Pattern Matching

Match extracted tokens against agent triggers:

```yaml
# For each agent in agent-triggers.yaml
match_score = 0

# Keyword match
for keyword in user_keywords:
  if keyword in agent.keywords:
    match_score += agent.keyword_weight (default: 40)

# Action match
for action in user_actions:
  if action in agent.actions:
    match_score += agent.action_weight (default: 40)

# File pattern match
for pattern in user_file_refs:
  if matches(pattern, agent.file_patterns):
    match_score += agent.file_weight (default: 30)

# Context bonus
if agent == recent_agent:
  match_score += context_bonus (default: 10)
```

### 3. Confidence Calculation

```
confidence = min(100, match_score)
```

### 4. Decision

```
if confidence >= 90:
    auto_execute()
elif confidence >= 70:
    request_confirmation()
else:
    list_options()
```

## Detection Patterns

### Keyword Patterns

```yaml
# Korean keywords
korean:
  - "고" → go
  - "파이썬" → python
  - "러스트" → rust
  - "타입스크립트" → typescript

# Action verbs (Korean)
actions_kr:
  - "리뷰" → review
  - "분석" → analyze
  - "수정" → fix
  - "생성" → create
  - "만들어" → create
  - "확인" → check
```

### File Pattern Matching

```yaml
patterns:
  go: ["*.go", "go.mod", "go.sum"]
  python: ["*.py", "requirements.txt", "pyproject.toml", "setup.py"]
  rust: ["*.rs", "Cargo.toml"]
  typescript: ["*.ts", "*.tsx", "tsconfig.json"]
  kotlin: ["*.kt", "*.kts", "build.gradle.kts"]
```

## Output Format

### High Confidence

```
[Intent Detected]
├── Input: "Go 코드 리뷰해줘"
├── Agent: lang-golang-expert
├── Confidence: 95%
└── Reason: "Go" keyword + "리뷰" action

┌─ Agent: lang-golang-expert (sw-engineer)
└─ Task: Code review
```

### Medium Confidence

```
[Intent Detected]
├── Input: "백엔드 API 확인해줘"
├── Detected: be-go-backend-expert (?)
├── Confidence: 78%
└── Alternatives available

Select agent:
  1. be-go-backend-expert (78%)
  2. be-fastapi-expert (72%)
  3. be-springboot-expert (68%)

Choice [1-3, or agent name]:
```

### Override

```
[Override Detected]
├── Input: "@lang-python-expert review api.py"
├── Agent: lang-python-expert (explicit)
└── Bypassing intent detection

┌─ Agent: lang-python-expert (sw-engineer)
└─ Task: Review api.py
```

## Integration

### With Secretary

```
Secretary uses this skill to:
1. Parse incoming user requests
2. Detect intent and select agent
3. Display reasoning
4. Handle confirmations
5. Route to selected agent
```

### With Agent Triggers

```
Load triggers from:
.claude/skills/intent-detection/patterns/agent-triggers.yaml

Each agent defines:
- keywords (language names, tech terms)
- file_patterns (extensions, config files)
- actions (supported actions)
- weights (scoring factors)
```

## Error Handling

### No Match

```
[Intent Unclear]
├── Input: "도와줘"
├── Confidence: < 30%
└── Too generic to detect intent

How can I help? Please be more specific:
- What type of task? (review, create, fix, ...)
- What language/technology? (Go, Python, ...)
- What file or project?
```

### Ambiguous Match

```
[Intent Ambiguous]
├── Input: "코드 리뷰"
├── Top matches:
│   └── All experts: ~50% each
└── Need file context or language hint

Specify the language or provide a file path.
```

## Configuration

```yaml
intent_detection:
  enabled: true
  auto_execute_threshold: 90
  confirm_threshold: 70
  show_reasoning: true
  max_alternatives: 3
  korean_support: true
```
