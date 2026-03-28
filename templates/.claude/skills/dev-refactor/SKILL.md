---
name: dev-refactor
description: Refactor code for better structure and patterns
scope: core
argument-hint: "<file-or-directory> [--lang <language>] [--spec]"
user-invocable: true
---

# Code Refactoring Skill

Refactor code for better structure, naming, and patterns using language-specific expert agents.

## When NOT to Use

| Scenario | Better Alternative |
|----------|--------------------|
| Renaming only (no structural change) | IDE rename refactoring or `sed` |
| Formatting cleanup | Run formatter (`prettier`, `gofmt`, `black`) |
| No test coverage for target code | Write tests first (`/structured-dev-cycle`) |
| Moving files between directories | `git mv` via mgr-gitnerd |

**Pre-execution check**: Verify test coverage exists for the refactoring target. Refactoring without tests risks silent regressions.

## Pre-flight Guards

Before executing the refactoring workflow, the agent MUST run these checks:

### Guard 1: Test Coverage Check
**Level**: WARN
**Check**: Verify test files exist for the refactoring target
```bash
# For target file src/module/foo.ts, check for:
# - src/module/foo.test.ts
# - src/module/foo.spec.ts
# - tests/module/foo.test.ts
# - test/module/foo.test.ts
# - __tests__/module/foo.test.ts
# For Go: foo_test.go in same package
# For Python: test_foo.py or foo_test.py
```
**Action**: `[Pre-flight] WARN: No test file found for {target}. Refactoring without tests risks silent regressions. Consider writing tests first (/structured-dev-cycle).`

### Guard 2: Rename-Only Detection
**Level**: INFO
**Check**: If the user request is purely about renaming (no structural change)
```
# Keyword detection in user request
keywords: rename, 이름 변경, 이름 바꿔, rename variable, rename function
# AND no structural keywords
structural_keywords: extract, split, merge, restructure, reorganize, decompose
```
**Action**: `[Pre-flight] INFO: For rename-only refactoring, IDE rename (F2) or sed is faster and safer (handles all references). Proceeding with full refactoring.`

### Guard 3: Formatting-Only Request Detection
**Level**: INFO
**Check**: If the request is about formatting or style cleanup
```
# Keyword detection
keywords: format, formatting, indent, indentation, 포맷, 스타일, whitespace, spacing
```
**Action**: `[Pre-flight] INFO: For formatting cleanup, run the appropriate formatter (prettier, gofmt, black, rustfmt). Proceeding with full refactoring.`

### Guard 4: File Move Detection
**Level**: INFO
**Check**: If the request is about moving files between directories
```
# Keyword detection
keywords: move file, move to, 파일 이동, 옮겨, relocate, reorganize files
# AND no code-level changes mentioned
```
**Action**: `[Pre-flight] INFO: For file moves without code changes, use git mv via mgr-gitnerd to preserve git history.`

### Display Format

```
[Pre-flight] dev-refactor
├── Test coverage: WARN — no test file for src/utils.ts
├── Rename-only: PASS
├── Formatting-only: PASS
└── File move: PASS
Result: PROCEED WITH CAUTION (0 GATE, 1 WARN, 0 INFO)
```

If any GATE: block and suggest prerequisite.
If any WARN: show warning, ask user to confirm.
If only PASS/INFO: proceed automatically.

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
0. Run pre-flight guards (MUST complete before proceeding)
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

## Spec Mode (`--spec`)

When the `--spec` flag is present, refactoring is guided by the target's canonical specification:

### Workflow

1. **Load spec**: Read `.claude/specs/<agent-name>.spec.md` (generated by `/omcustom-takeover`)
   - If spec doesn't exist, run takeover first: `/omcustom-takeover <name>`
2. **Extract invariants**: Parse the spec's `## Invariants` section as pre-flight guard constraints
3. **Refactor**: Perform normal refactoring (per existing workflow)
4. **Verify invariants**: After refactoring, check each invariant still holds:
   ```
   [Spec Verification]
   ├── ✓ Invariant 1: {description} — PASS
   ├── ✓ Invariant 2: {description} — PASS
   └── ✗ Invariant 3: {description} — FAIL (reason)
   ```
5. **Regenerate spec**: If refactoring changed the contract, run `/omcustom-takeover <name>` to update

### When to Use

| Scenario | Use `--spec`? |
|----------|--------------|
| Refactoring agent internals | Yes — preserves declared invariants |
| Renaming/restructuring skill | Yes — ensures contract stability |
| Simple code cleanup | No — overhead not justified |
| Adding new capability | No — spec will change anyway |

### Prerequisites

- `.claude/specs/<name>.spec.md` must exist (or will be auto-generated via takeover)
- Target must be an agent or skill (not arbitrary code)
