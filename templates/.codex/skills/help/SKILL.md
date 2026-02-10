---
name: help
description: Show help information for commands and system
argument-hint: "[command] [--agents] [--rules]"
---

# Help Skill

Show help information for commands, agents, and system rules.

## Options

```
--agents, -a     List all available agents
--commands, -c   List all commands (same as 'lists')
--rules, -r      List all rules
```

## Output Format

### Default Help
```
AI Agent System - Help

Usage: {command} [arguments] [options]

Quick Start:
  lists              Show all available commands
  status             Show system status
  help <command>     Get help for a specific command

Common Commands:
  /update-docs       Sync documentation with project
  /update-external   Update external agents
  /audit-agents      Check agent dependencies
  /create-agent      Create a new agent

Use "lists" to see all available commands.
Use "help <command>" for detailed help.
```

### Command Help
```
help /update-docs

Command: /update-docs

Description:
  Sync documentation with project structure. Ensures all
  documentation accurately reflects the current project state.

Usage:
  /update-docs
  /update-docs --check
  /update-docs --target <path>

Options:
  --check, -c      Check only, don't modify
  --verbose, -v    Show detailed changes
  --target, -t     Specific target to update

Examples:
  /update-docs                 # Update all documentation
  /update-docs --check         # Check for issues
  /update-docs --target agents # Update agents only
```

### Agent List
```
help --agents

Available Agents:

Orchestrator:
  secretary        Manages manager agents

Manager:
  mgr-creator          Creates new agents
  mgr-updater          Updates external sources and docs
  mgr-supplier         Validates dependencies

SW Engineer:
  lang-golang-expert       Go development (Effective Go)
  lang-python-expert       Python development (PEP 8)
  lang-rust-expert         Rust development (API Guidelines)
  lang-kotlin-expert       Kotlin development (JetBrains)
  lang-typescript-expert   TypeScript development (Google)
  fe-vercel-agent  React/Next.js (Vercel)

Backend Engineer:
  be-fastapi-expert      FastAPI (Python async)
  be-springboot-expert   Spring Boot (Java)
  be-go-backend-expert   Go backend (Uber style)

Infra Engineer:
  infra-docker-expert       Docker containerization
  infra-aws-expert          AWS architecture

Total: 15 agents
```

### Rules List
```
help --rules

Global Rules:

MUST (Never violate):
  R000  Language Policy      Korean I/O, English files
  R001  Safety Rules         Prohibited actions
  R002  Permission Rules     Tool tiers, file access
  R006  Agent Design         Structure, separation

SHOULD (Strongly recommended):
  R003  Interaction Rules    Response format
  R004  Error Handling       Error levels, recovery
  R007  Agent Identification Display agent in responses
  R008  Tool Identification  Display agent when using tools

MAY (Optional):
  R005  Optimization         Efficiency guidelines
  R009  Parallel Execution   Max 4 parallel instances

Total: 10 rules
```
