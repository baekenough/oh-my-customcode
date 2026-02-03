---
name: audit-agents
description: Audit agent dependencies and references
argument-hint: "[agent-name] [--all] [--fix]"
---

# Audit Agents Skill

Audit agent dependencies to ensure all skill and guide references are valid and symlinks are working.

## Options

```
--all, -a        Audit all agents
--verbose, -v    Show detailed results
--fix            Auto-fix issues (delegates to /fix-refs)
```

## Workflow

```
1. Load agent configuration
   └── Read agent .md file

2. Check skills
   ├── Skill exists in .claude/skills/
   └── Skill path is valid

3. Check guides
   ├── Guide exists in guides/
   └── Guide path is valid

4. Report results
```

## Output Format

### Single Agent
```
[mgr-supplier:audit lang-golang-expert]

Auditing: lang-golang-expert

Skills:
  ✓ go-best-practices
    Path: .claude/skills/go-best-practices/
    Status: Valid

Guides:
  ✓ golang
    Path: guides/golang/
    Status: Valid

Summary:
  Skills: 1/1 valid
  Guides: 1/1 valid
  Status: HEALTHY
```

### All Agents
```
[mgr-supplier:audit --all]

Auditing all agents...

sw-engineer:
  ✓ lang-golang-expert      (2/2 deps valid)
  ✓ lang-python-expert      (2/2 deps valid)
  ✓ lang-rust-expert        (2/2 deps valid)
  ✗ lang-kotlin-expert      (1/2 deps valid)
    └─ Missing: kotlin guide symlink

sw-engineer/backend:
  ✓ be-fastapi-expert     (2/2 deps valid)
  ✓ be-springboot-expert  (2/2 deps valid)
  ✓ be-go-backend-expert  (2/2 deps valid)

infra-engineer:
  ✓ infra-docker-expert      (2/2 deps valid)
  ✓ infra-aws-expert         (2/2 deps valid)

Summary:
  Total agents: 15
  Healthy: 14
  Issues: 1

Run "mgr-supplier:fix lang-kotlin-expert" to fix issues.
```

### Verbose Output
```
[mgr-supplier:audit lang-golang-expert --verbose]

Auditing: lang-golang-expert

Configuration:
  Path: .claude/agents/lang-golang-expert.md
  Type: sw-engineer
  Source: internal

Declared Skills:
  [1] go-best-practices
      Path: .claude/skills/go-best-practices/
      Exists: ✓

Declared Guides:
  [1] golang
      Path: guides/golang/
      Exists: ✓

Cross-references:
  ✓ go-best-practices.used_by includes lang-golang-expert
  ✓ golang.used_by includes lang-golang-expert

Status: HEALTHY (all checks passed)
```
