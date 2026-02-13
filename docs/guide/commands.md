# CLI Commands

oh-my-customcode provides a CLI tool (`omcustom`) for managing Claude/Codex agent system templates.

## Overview

| Command | Description |
|---------|-------------|
| `omcustom init` | Initialize agent system |
| `omcustom update` | Update managed components to latest templates |
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
| `-l, --lang <language>` | Language for templates (`en` or `ko`). Default: `en` |
| `-p, --provider <provider>` | Provider to initialize (`auto`, `claude`, `codex`). Default: `auto` |

### Examples

```bash
# Auto-detect provider and initialize
omcustom init

# Initialize with Korean templates
omcustom init --lang ko

# Force provider selection to Codex
omcustom init --provider codex
```

## update

Update managed components in the current project.

```bash
omcustom update [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would change without writing files |
| `--force` | Force update even if already at latest version |
| `--force-overwrite-all` | Bypass preservation logic (manifest/config preserve rules) |
| `--backup` | Create backup before updating |
| `--agents` | Update only agents |
| `--skills` | Update only skills |
| `--rules` | Update only rules |
| `--guides` | Update only guides |
| `--hooks` | Update only hooks |
| `--contexts` | Update only contexts |
| `-p, --provider <provider>` | Provider to update (`auto`, `claude`, `codex`). Default: `auto` |

### Examples

```bash
# Update everything (provider auto-detected)
omcustom update

# Preview changes only
omcustom update --dry-run

# Update only agents and skills
omcustom update --agents --skills

# Update Codex components only
omcustom update --provider codex
```

## list

List installed components.

```bash
omcustom list [options] [type]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `type` | One of `agents`, `skills`, `guides`, `rules`, or `all` (default: `all`) |

### Options

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `table`, `json`, or `simple` (default: `table`) |
| `--verbose` | Show detailed information |
| `-p, --provider <provider>` | Provider to list (`auto`, `claude`, `codex`). Default: `auto` |

### Examples

```bash
# List all components
omcustom list

# List only agents
omcustom list agents

# List skills as JSON
omcustom list skills --format json

# List for specific provider
omcustom list --provider codex
```

## doctor

Check installation health.

```bash
omcustom doctor [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--fix` | Automatically fix issues that can be repaired |
| `-p, --provider <provider>` | Provider to diagnose (`auto`, `claude`, `codex`). Default: `auto` |

### Examples

```bash
# Run health checks
omcustom doctor

# Auto-fix repairable issues
omcustom doctor --fix

# Diagnose Codex layout explicitly
omcustom doctor --provider codex
```

## Global Options

| Option | Description |
|--------|-------------|
| `--skip-version-check` | Skip CLI tool pre-flight version checks |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error |
| `2` | Invalid arguments |
