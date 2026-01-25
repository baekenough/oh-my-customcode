# CLI Commands

oh-my-customcode provides a CLI tool (`omcc`) for managing your agent system.

## Overview

| Command | Description |
|---------|-------------|
| `omcc init` | Initialize agent system |
| `omcc update` | Update to latest version |
| `omcc list` | List installed components |
| `omcc doctor` | Verify installation health |

## init

Initialize the agent system in your current project.

```bash
omcc init [options]
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
omcc init

# Initialize with Korean language
omcc init --lang ko

# Backup existing and initialize
omcc init --backup

# Force overwrite existing files
omcc init --force
```

## update

Update agents, skills, and rules to the latest versions.

```bash
omcc update [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--preserve-custom` | Keep custom modifications (default: true) |
| `--force` | Force update all files |

### Examples

```bash
# Standard update (preserves customizations)
omcc update

# Force update all files
omcc update --force
```

## list

List installed components in your project.

```bash
omcc list [type] [options]
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
omcc list

# List only agents
omcc list agents

# List skills as JSON
omcc list skills --format json
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
omcc doctor [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--fix` | Auto-fix common issues |
| `--verbose` | Show detailed output |

### Examples

```bash
# Check installation health
omcc doctor

# Check and auto-fix issues
omcc doctor --fix

# Detailed health check
omcc doctor --verbose
```

### Health Checks

The doctor command verifies:

- CLAUDE.md exists and is valid
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

✓ CLAUDE.md exists
✓ .claude/rules directory exists
✓ agents directory exists
✓ skills directory exists
✗ Missing agent: agents/manager/creator/index.yaml

Issues found: 1
Run 'omcc doctor --fix' to auto-repair
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
