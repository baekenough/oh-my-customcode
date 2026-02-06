---
name: status
description: Show system status and health checks
argument-hint: "[--verbose] [--health]"
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
  Rules: 10 loaded (R000-R009)

Agents:
  Orchestrator:     1 (secretary)
  Manager:          3 (mgr-creator, mgr-updater, mgr-supplier)
  SW Engineer:      6
  Backend Engineer: 3
  Infra Engineer:   2
  Total:           15 agents

Skills:
  Development:     8
  Backend:         3
  Infrastructure:  2
  Total:          13 skills

Guides:            12 loaded
Commands:          10 available

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
  orchestrator/
    ✓ secretary (internal)

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
  ✓ 15/15 agents valid
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
