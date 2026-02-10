---
name: dev-review
description: Review code against language-specific best practices
argument-hint: "<file-or-directory> [--lang <language>]"
---

# Code Review Skill

Review code for best practices using language-specific expert agents.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | File or directory to review |

## Options

```
--lang, -l       Language (auto-detected if not specified)
                 Values: go, python, rust, kotlin, typescript, java
--focus, -f      Focus area (style, performance, security, all)
--verbose, -v    Detailed output
```

## Workflow

```
1. Detect language (or use --lang)
2. Select appropriate expert agent
3. Load language-specific skill
4. Analyze code against best practices
5. Generate review report
```

## Agent Selection

| File Extension | Agent | Skill |
|----------------|-------|-------|
| .go | lang-golang-expert | go-best-practices |
| .py | lang-python-expert | python-best-practices |
| .rs | lang-rust-expert | rust-best-practices |
| .kt | lang-kotlin-expert | kotlin-best-practices |
| .ts, .tsx | lang-typescript-expert | typescript-best-practices |
| .java | be-springboot-expert | springboot-best-practices |
| .jsx, .js (React) | fe-vercel-agent | react-best-practices |

## Output Format

```
[dev:review src/main.go]

┌─ Agent: lang-golang-expert (sw-engineer)
├─ Skill: go-best-practices
└─ File: src/main.go

Review Results:

[Style] Line 15
  Issue: Variable name should be camelCase
  Found: user_name
  Suggest: userName

[Error Handling] Line 42
  Issue: Error not checked
  Found: file.Close()
  Suggest: if err := file.Close(); err != nil { ... }

[Performance] Line 78
  Issue: Inefficient string concatenation in loop
  Found: str += item
  Suggest: Use strings.Builder

Summary:
  Style: 1 issue
  Error Handling: 1 issue
  Performance: 1 issue
  Total: 3 issues

Recommendation: Fix error handling issues first.
```
