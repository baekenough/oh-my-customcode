---
name: dev-review
description: Review code against language-specific best practices
scope: core
argument-hint: "<file-or-directory> [--lang <language>]"
user-invocable: true
---

# Code Review Skill

Review code for best practices using language-specific expert agents.

## When NOT to Use

| Scenario | Better Alternative |
|----------|--------------------|
| Formatting/style issues only | Run linter or formatter directly (`prettier`, `gofmt`, `black`) |
| Single syntax error | IDE/LSP diagnostics |
| Auto-generated code | Skip — generated code follows its own conventions |
| Pre-commit quick check | Git hooks with linter integration |

**Pre-execution check**: If the issue is purely formatting, run the appropriate formatter first.

## Pre-flight Guards

Before executing the review workflow, the agent MUST run these checks:

### Guard 1: Auto-generated Code Detection
**Level**: WARN
**Check**: Scan target files for auto-generation markers
```bash
# Detection patterns (any match = WARN)
grep -rl "DO NOT EDIT" {target} 2>/dev/null
grep -rl "auto-generated" {target} 2>/dev/null
grep -rl "@generated" {target} 2>/dev/null
# File pattern detection
# *.gen.*, *.pb.go, */generated/*, */proto/*, *_generated.*, *.g.dart
```
**Action**: `[Pre-flight] WARN: Auto-generated code detected in {file}. Generated code follows its own conventions — review may produce false positives. Continue? [Y/n]`

### Guard 2: Formatting-Only Changes Detection
**Level**: INFO
**Check**: If reviewing changed files (not full codebase), check if changes are formatting-only
```bash
# If git diff is available for the target
git diff --stat {target} | grep -E '^\s+\d+ files? changed'
# Compare with whitespace-ignored diff
git diff -w {target}
# If -w diff is empty but regular diff has changes → formatting only
```
**Action**: `[Pre-flight] INFO: Changes in {file} appear to be formatting-only. Consider running the appropriate formatter instead (prettier, gofmt, black).`

### Guard 3: Single Syntax Error Detection
**Level**: INFO
**Check**: If target is a single file and the request mentions "error", "syntax", or "broken"
```
# Keyword detection in user request
keywords: error, syntax, broken, doesn't compile, won't build
# Single file check
target is exactly 1 file (not a directory)
```
**Action**: `[Pre-flight] INFO: For single syntax errors, IDE/LSP diagnostics are faster. Proceeding with full review.`

### Guard 4: Linter/Formatter Available Detection
**Level**: INFO
**Check**: Detect if a project-appropriate linter exists
```bash
# Check for linter configs in project root
ls .eslintrc* .prettierrc* biome.json .golangci.yml pyproject.toml .rubocop.yml 2>/dev/null
```
**Action**: `[Pre-flight] INFO: Linter config found ({config}). For style-only issues, run the linter directly.`

### Display Format

```
[Pre-flight] dev-review
├── Auto-generated code: PASS
├── Formatting-only changes: INFO — whitespace changes in src/util.ts
├── Single syntax error: PASS
└── Linter available: INFO — .eslintrc.json found
Result: PROCEED (0 GATE, 0 WARN, 2 INFO)
```

If any GATE: block and suggest alternative.
If any WARN: show warning, ask user to confirm.
If only PASS/INFO: proceed automatically.

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
0. Run pre-flight guards (see ## Pre-flight Guards)
1. Detect language (or use --lang)
2. Select appropriate expert agent
3. Load language-specific skill
4. Analyze code against best practices
5. Generate review report
```
6. **Artifact persistence** (optional): Review agent saves findings to:
   ```
   .claude/outputs/sessions/{YYYY-MM-DD}/dev-review-{HHmmss}.md
   ```
   With metadata header:
   ```markdown
   ---
   skill: dev-review
   date: {ISO-8601 with timezone}
   query: "{original user query}"
   ---
   ```
   The review agent creates the directory and writes the artifact before returning results (R010 compliance).

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
