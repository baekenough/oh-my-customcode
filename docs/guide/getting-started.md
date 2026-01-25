# Getting Started

This guide will help you install and set up oh-my-customcode in your project.

## Prerequisites

- **Node.js** >= 18.0.0
- **Claude Code CLI** installed and configured

## Installation

### Global Installation (Recommended)

Install oh-my-customcode globally to use it across all your projects:

```bash
npm install -g oh-my-customcode
```

Or with other package managers:

```bash
# Using yarn
yarn global add oh-my-customcode

# Using pnpm
pnpm add -g oh-my-customcode

# Using bun
bun add -g oh-my-customcode
```

### Verify Installation

```bash
omcc --version
```

## Initialize Your Project

Navigate to your project directory and run:

```bash
cd your-project
omcc init
```

This creates:

```
your-project/
├── CLAUDE.md              # Main entry point for Claude
├── .claude/
│   ├── rules/             # Global rules (MUST, SHOULD, MAY)
│   ├── hooks/             # Hook scripts
│   └── contexts/          # Context files
├── agents/                # Agent definitions
├── skills/                # Skill definitions
├── guides/                # Reference documentation
├── pipelines/             # Pipeline definitions
└── commands/              # Command definitions
```

## Language Options

Initialize with Korean language support:

```bash
omcc init --lang ko
```

## Backup Existing Installation

If you already have an agent system and want to preserve it:

```bash
omcc init --backup
```

This creates a backup of your existing `.claude` directory before initializing.

## Verify Installation

Run the doctor command to check that everything is set up correctly:

```bash
omcc doctor
```

If issues are found, you can auto-fix common problems:

```bash
omcc doctor --fix
```

## What's Next?

- Learn about [CLI Commands](/guide/commands) for managing your agent system
- Explore [Customization](/guide/customization) to tailor agents to your needs
- Browse the [Agents Reference](/reference/agents) to see all available agents

## Updating

Keep your agent system up to date:

```bash
omcc update
```

This updates all agents, skills, and rules to the latest versions while preserving your customizations.
