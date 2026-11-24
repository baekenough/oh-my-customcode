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

## Measurement

Every count in the output is measured at run time from the files present in the project. Never copy a number from the examples below, and never hardcode a count or an ID range: projects add their own rules, agents, skills and guides.

```bash
find .claude/rules -maxdepth 1 -name '*.md' | wc -l                  # Rules
find .claude/agents -maxdepth 1 -name '*.md' | wc -l                 # Agents (Total)
command ls -1d .claude/skills/*/ | wc -l                            # Skills (Total)
find guides -mindepth 1 -maxdepth 1 -type d | wc -l                  # Guides
```

The rules count covers only `.claude/rules/*.md`. Non-rule files such as `index.yaml` are not rules and are not counted. The rules line shows the measured count only, with no ID range. Rules are grouped by the `MUST-`/`SHOULD-`/`MAY-` file-name prefix. The rule ID is read from the `**ID**:` header line of each rule file.

## Output Format

The blocks below are examples of the layout only. `{N}` is replaced with the measured value.

### Default Status
```
AI Agent System - Status

System:
  Rules: {N} loaded

Agents:
  Manager:        {N} (mgr-creator, mgr-updater, mgr-supplier, ...)
  SW Engineer:    {N}
  DE Engineer:    {N}
  Database:       {N}
  Infra Engineer: {N}
  Other:          {N} (security, architect, QA, system)
  Total:          {N} agents

Skills:
  Total:          {N} skills

Guides:            {N} loaded

Health: ✓ OK
```

### Verbose Status
```
status --verbose

AI Agent System - Detailed Status

Rules:
  MUST:
    ✓ R{NNN} {name}

  SHOULD:
    ✓ R{NNN} {name}

  MAY:
    ✓ R{NNN} {name}

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
  ✓ {N}/{N} agents valid
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
