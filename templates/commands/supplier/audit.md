# Command: supplier:audit

> Audit agent dependencies

## Usage

```
supplier:audit
supplier:audit <agent-name>
supplier:audit --all
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| target | string | no | Specific agent to audit |

## Options

```
--all, -a        Audit all agents
--verbose, -v    Show detailed results
--fix            Auto-fix issues (delegates to supplier:fix)
```

## Workflow

```
1. Load agent configuration
   └── Read index.yaml

2. Check skills
   ├── Skill exists in skills/
   ├── Skill path is valid
   └── Symlink in refs/ is valid

3. Check guides
   ├── Guide exists in guides/
   ├── Guide path is valid
   └── Symlink in refs/ is valid

4. Report results
```

## Output

### Single Agent

```
[supplier:audit golang-expert]

Auditing: golang-expert

Skills:
  ✓ go-best-practices
    Path: ../../../skills/development/go-best-practices/
    Status: Valid

Guides:
  ✓ golang
    Path: ../../../guides/golang/
    Status: Valid

Summary:
  Skills: 1/1 valid
  Guides: 1/1 valid
  Status: HEALTHY
```

### All Agents

```
[supplier:audit --all]

Auditing all agents...

sw-engineer:
  ✓ golang-expert      (2/2 deps valid)
  ✓ python-expert      (2/2 deps valid)
  ✓ rust-expert        (2/2 deps valid)
  ✗ kotlin-expert      (1/2 deps valid)
    └─ Missing: kotlin guide symlink

sw-engineer/backend:
  ✓ fastapi-expert     (2/2 deps valid)
  ✓ springboot-expert  (2/2 deps valid)
  ✓ go-backend-expert  (2/2 deps valid)

infra-engineer:
  ✓ docker-expert      (2/2 deps valid)
  ✓ aws-expert         (2/2 deps valid)

Summary:
  Total agents: 15
  Healthy: 14
  Issues: 1

Run "supplier:fix kotlin-expert" to fix issues.
```

### Verbose Output

```
[supplier:audit golang-expert --verbose]

Auditing: golang-expert

Configuration:
  Path: agents/sw-engineer/golang-expert/
  Type: sw-engineer
  Source: internal

Declared Skills:
  [1] go-best-practices
      Declared path: ../../../skills/development/go-best-practices/
      Resolved path: /path/to/skills/development/go-best-practices/
      Exists: ✓
      Symlink: refs/go-best-practices → ✓

Declared Guides:
  [1] golang
      Declared path: ../../../guides/golang/
      Resolved path: /path/to/guides/golang/
      Exists: ✓
      Symlink: refs/golang → ✓

Cross-references:
  ✓ go-best-practices.used_by includes golang-expert
  ✓ golang.used_by includes golang-expert

Status: HEALTHY (all checks passed)
```
