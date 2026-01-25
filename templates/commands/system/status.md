# Command: status

> Show system status

## Usage

```
status
status --verbose
status --health
```

## Options

```
--verbose, -v    Detailed status
--health, -h     Health checks only
```

## Output

### Default Status

```
Baekgom Agents - Status

System:
  Rules: 10 loaded (R000-R009)

Agents:
  Orchestrator:     1 (secretary)
  Manager:          3 (creator, updater, supplier)
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

Baekgom Agents - Detailed Status

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
    ✓ creator (internal)
    ✓ updater (internal)
    ✓ supplier (internal)

  sw-engineer/
    ✓ golang-expert (internal)
    ✓ python-expert (internal)
    ✓ rust-expert (internal)
    ✓ kotlin-expert (internal)
    ✓ typescript-expert (internal)
    ✓ vercel-agent (external v1.0.0)

  sw-engineer/backend/
    ✓ fastapi-expert (internal)
    ✓ springboot-expert (internal)
    ✓ go-backend-expert (internal)

  infra-engineer/
    ✓ docker-expert (internal)
    ✓ aws-expert (internal)

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
  creator:   agent
  updater:   docs, external
  supplier:  audit, fix
  dev:       review, refactor

All systems operational.
```

### Health Check

```
status --health

Health Checks:

Agents:
  ✓ 15/15 agents valid
  ✓ All paths exist
  ✓ All index.yaml valid

Dependencies:
  ✓ All skill references valid
  ✓ All guide references valid
  ✓ No broken symlinks

External Sources:
  ✓ vercel-agent (github: reachable)

Documentation:
  ✓ CLAUDE.md in sync
  ✓ agents/index.yaml in sync
  ✓ skills/index.yaml in sync
  ✓ guides/index.yaml in sync

Result: HEALTHY
```
