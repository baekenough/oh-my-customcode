# CLI Commands

oh-my-customcode provides a CLI tool (`omcustom`) for managing your agent system.

## Overview

| Command | Description |
|---------|-------------|
| `omcustom init` | Initialize agent system |
| `omcustom update` | Update to latest version |
| `omcustom list` | List installed components |
| `omcustom doctor` | Verify installation health |

## init

Initialize the agent system in your current project.

```bash
omcustom init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--lang <code>` | Language for templates (`en` or `ko`). Default: `en` |
| `--backup` | Backup existing installation before init |
| `--force` | Overwrite existing files without prompting |

### Examples

```bash
# Basic initialization
omcustom init

# Initialize with Korean language
omcustom init --lang ko

# Backup existing and initialize
omcustom init --backup

# Force overwrite existing files
omcustom init --force
```

## update

Update agents, skills, and rules to the latest versions.

```bash
omcustom update [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--preserve-custom` | Keep custom modifications (default: true) |
| `--force` | Force update all files |

### Examples

```bash
# Standard update (preserves customizations)
omcustom update

# Force update all files
omcustom update --force
```

## list

List installed components in your project.

```bash
omcustom list [type] [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `type` | Optional. One of: `agents`, `skills`, `rules`, `guides` |

### Options

| Option | Description |
|--------|-------------|
| `--format <format>` | Output format: `table` (default) or `json` |

### Examples

```bash
# List all components
omcustom list

# List only agents
omcustom list agents

# List skills as JSON
omcustom list skills --format json
```

### Sample Output

```
Agents (36 total)
┌─────────────────┬───────────────────┬──────────────────────────────┐
│ Category        │ Agent             │ Description                  │
├─────────────────┼───────────────────┼──────────────────────────────┤
│ orchestrator    │ planner           │ Master orchestrator          │
│ orchestrator    │ secretary         │ Task coordination            │
│ orchestrator    │ dev-lead          │ Development coordination     │
│ orchestrator    │ qa-lead           │ QA coordination              │
│ manager         │ creator           │ Agent creation               │
│ ...             │ ...               │ ...                          │
└─────────────────┴───────────────────┴──────────────────────────────┘
```

## doctor

Verify installation health and fix common issues.

```bash
omcustom doctor [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--fix` | Auto-fix common issues |
| `--verbose` | Show detailed output |

### Examples

```bash
# Check installation health
omcustom doctor

# Check and auto-fix issues
omcustom doctor --fix

# Detailed health check
omcustom doctor --verbose
```

### Health Checks

The doctor command verifies:

- Entry file exists and is valid (CLAUDE.md for Claude, AGENTS.md for Codex)
- All required directories exist
- Agent definitions are complete
- Skill references are valid
- Rule files are properly formatted
- No broken symlinks

### Sample Output

```
oh-my-customcode Doctor
=======================

Checking installation health...

✓ Entry file exists (CLAUDE.md or AGENTS.md)
✓ Provider rules directory exists (.claude/rules or .codex/rules)
✓ Provider agents directory exists (.claude/agents or .codex/agents)
✓ Provider skills directory exists (.claude/skills or .codex/skills)
✗ Missing agent: .claude/agents/mgr-creator.md

Issues found: 1
Run 'omcustom doctor --fix' to auto-repair
```

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help for command |
| `-V, --version` | Show version number |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 2 | Invalid arguments |
