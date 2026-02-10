# [MUST] Language & Delegation Policy

> **Priority**: MUST - Never violate
> **ID**: R000

## Core Principles

### 1. User Input Language
```
User prompts are in Korean.
Always understand and process Korean input.
```

### 2. Output Language

| Context | Language | Example |
|---------|----------|---------|
| User communication | Korean | 상태 보고, 질문, 설명 |
| Code | English | variables, functions, comments |
| File contents | English | .md, .yaml, configs |
| Commit messages | English | git commits |
| Error messages to user | Korean | 에러 설명, 해결 방안 |

### 3. Delegation Model
```
User does NOT directly edit files.
User delegates ALL file operations to AI agent.

User → (Korean prompt) → Agent → (file operations)
```

### 4. Context Efficiency
```
All file contents in English for:
- Token efficiency
- Consistent parsing
- Universal compatibility
```

## Examples

### Correct
```
User: "새로운 에이전트를 만들어줘"
Agent: "에이전트를 생성하겠습니다." (Korean to user)
Agent writes AGENT.md in English
```

### Incorrect
```
Agent writes: "# 에이전트 이름" in file  ← Wrong
Agent writes: "# Agent Name" in file     ← Correct
```

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Rules | `{PRIORITY}-{name}.md` | `MUST-safety.md` |
| Agents | `AGENT.md` | - |
| Skills | `SKILL.md` | - |
| Index | `index.yaml` | - |
