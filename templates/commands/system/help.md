# Command: help

> Show help information

## Usage

```
help
help <command>
help --agents
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | string | no | Command or topic to get help for |

## Options

```
--agents, -a     List all available agents
--commands, -c   List all commands (same as 'lists')
--rules, -r      List all rules
```

## Output

### Default Help

```
Baekgom Agents - Help

Usage: {command} [arguments] [options]

Quick Start:
  lists              Show all available commands
  status             Show system status
  help <command>     Get help for a specific command

Common Commands:
  updater:docs       Sync documentation with project
  updater:external   Update external agents
  supplier:audit     Check agent dependencies
  creator:agent      Create a new agent

Use "lists" to see all available commands.
Use "help <command>" for detailed help.
```

### Command Help

```
help updater:docs

Command: updater:docs

Description:
  Sync documentation with project structure. Ensures all
  documentation accurately reflects the current project state.

Usage:
  updater:docs
  updater:docs --check
  updater:docs --target <path>

Options:
  --check, -c      Check only, don't modify
  --verbose, -v    Show detailed changes
  --target, -t     Specific target to update

Examples:
  updater:docs                 # Update all documentation
  updater:docs --check         # Check for issues
  updater:docs --target agents # Update agents only
```

### Agent List

```
help --agents

Available Agents:

Orchestrator:
  secretary        Manages manager agents

Manager:
  creator          Creates new agents
  updater          Updates external sources and docs
  supplier         Validates dependencies

SW Engineer:
  golang-expert       Go development (Effective Go)
  python-expert       Python development (PEP 8)
  rust-expert         Rust development (API Guidelines)
  kotlin-expert       Kotlin development (JetBrains)
  typescript-expert   TypeScript development (Google)
  vercel-agent  React/Next.js (Vercel)

Backend Engineer:
  fastapi-expert      FastAPI (Python async)
  springboot-expert   Spring Boot (Java)
  go-backend-expert   Go backend (Uber style)

Infra Engineer:
  docker-expert       Docker containerization
  aws-expert          AWS architecture

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
