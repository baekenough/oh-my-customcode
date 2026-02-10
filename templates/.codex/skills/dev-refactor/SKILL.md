---
name: dev-refactor
description: Refactor code for better structure and patterns
argument-hint: "<file-or-directory> [--lang <language>]"
---

# Code Refactoring Skill

Refactor code for better structure, naming, and patterns using language-specific expert agents.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | File or directory to refactor |

## Options

```
--lang, -l       Language (auto-detected if not specified)
                 Values: go, python, rust, kotlin, typescript, java
--focus, -f      Focus area (structure, naming, patterns, all)
--dry-run        Show proposed changes without applying
--verbose, -v    Detailed output
```

## Workflow

```
1. Detect language (or use --lang)
2. Select appropriate expert agent
3. Load language-specific skill
4. Analyze code structure
5. Propose refactoring changes
6. Apply changes (if not --dry-run)
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

## Refactoring Categories

| Category | Description |
|----------|-------------|
| structure | File/module organization, package structure |
| naming | Variable, function, type naming conventions |
| patterns | Design patterns, idiomatic code |
| duplication | Extract common code, reduce repetition |
| complexity | Simplify complex functions, reduce nesting |

## Output Format

### Dry Run
```
[dev:refactor src/utils.go --dry-run]

┌─ Agent: lang-golang-expert (sw-engineer)
├─ Skill: go-best-practices
└─ File: src/utils.go

Analysis:

[Structure] Lines 10-45
  Issue: Function too long (35 lines)
  Suggest: Extract helper functions

[Naming] Line 12
  Issue: Abbreviation in function name
  Found: func procData()
  Suggest: func processData()

[Patterns] Lines 20-30
  Issue: Repeated error handling pattern
  Suggest: Create handleError() helper

Proposed Changes:
  1. Extract lines 15-25 into validateInput()
  2. Rename procData → processData
  3. Create handleError() helper function

No changes made (dry-run mode).
Run without --dry-run to apply changes.
```

### Apply Changes
```
[dev:refactor src/utils.go]

┌─ Agent: lang-golang-expert (sw-engineer)
├─ Skill: go-best-practices
└─ File: src/utils.go

Refactoring:

[1/3] Extracting validateInput()...
  ✓ Created function at line 50
  ✓ Updated calls at lines 15, 22

[2/3] Renaming procData → processData...
  ✓ Renamed function definition
  ✓ Updated 3 call sites

[3/3] Creating handleError() helper...
  ✓ Created function at line 60
  ✓ Replaced 5 error handling blocks

Summary:
  Changes applied: 3
  Lines modified: 28
  Functions added: 2
  Functions renamed: 1

Recommendation: Run tests to verify changes.
```
