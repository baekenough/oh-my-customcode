---
name: omcustom:status
description: Show system status and health checks
scope: harness
argument-hint: "[--verbose] [--health]"
user-invocable: true
---

# System Status Skill

Show comprehensive system status including agents, skills, guides, and health checks.

## Options

```
--verbose, -v    Detailed status
--health, -h     Health checks only
```

## Output Format

### Default Status
```
AI Agent System - Status

System:
  Rules: 23 loaded (R000-R023)

Agents:
  Manager:          6 (mgr-creator, mgr-updater, mgr-supplier, ...)
  SW Engineer:     21
  DE Engineer:      6
  Database:         4
  Infra Engineer:   2
  Other:           10 (security, architect, QA, system)
  Total:           49 agents

Skills:
  Total:          114 skills

Guides:            56 loaded
Commands:          60+ available

Health: ✓ OK
```

### Verbose Status
```
status --verbose

AI Agent System - Detailed Status

Rules:
  MUST:
    ✓ R000 language-policy
    ✓ R001 safety
    ✓ R002 permissions
    ✓ R006 agent-design

  SHOULD:
    ✓ R003 interaction
    ✓ R004 error-handling
    ✓ R007 agent-identification
    ✓ R008 tool-identification

  MAY:
    ✓ R005 optimization
    ✓ R009 parallel-execution

Agents:
  manager/
    ✓ mgr-creator (internal)
    ✓ mgr-updater (internal)
    ✓ mgr-supplier (internal)

  sw-engineer/
    ✓ lang-golang-expert (internal)
    ✓ lang-python-expert (internal)
    ✓ lang-rust-expert (internal)
    ✓ lang-kotlin-expert (internal)
    ✓ lang-typescript-expert (internal)
    ✓ fe-vercel-agent (external v1.0.0)

  sw-engineer/backend/
    ✓ be-fastapi-expert (internal)
    ✓ be-springboot-expert (internal)
    ✓ be-go-backend-expert (internal)

  infra-engineer/
    ✓ infra-docker-expert (internal)
    ✓ infra-aws-expert (internal)

Skills:
  development/
    ✓ go-best-practices
    ✓ python-best-practices
    ✓ rust-best-practices
    ✓ kotlin-best-practices
    ✓ typescript-best-practices
    ✓ react-best-practices
    ✓ web-design-guidelines
    ✓ vercel-deploy

  backend/
    ✓ fastapi-best-practices
    ✓ springboot-best-practices
    ✓ go-backend-best-practices

  infrastructure/
    ✓ docker-best-practices
    ✓ aws-best-practices

Guides:
  ✓ claude-code, web-design
  ✓ golang, python, rust, kotlin, typescript
  ✓ fastapi, springboot, go-backend
  ✓ docker, aws

Commands:
  system:    lists, status, help
  manager:   create-agent, update-docs, update-external, audit-agents, fix-refs
  dev:       dev-review, dev-refactor

All systems operational.
```

### Health Check
```
status --health

Health Checks:

Agents:
  ✓ 49/49 agents valid
  ✓ All agent files exist in .claude/agents/

Dependencies:
  ✓ All skill references valid
  ✓ All guide references valid

External Sources:
  ✓ fe-vercel-agent (github: reachable)

Documentation:
  ✓ CLAUDE.md in sync
  ✓ All .claude/agents/*.md files valid
  ✓ All .claude/skills/*/SKILL.md files valid

Result: HEALTHY
```
