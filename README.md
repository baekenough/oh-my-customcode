# oh-my-customcode

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)

**Batteries-included agent harness for Claude Code**

Transform your Claude Code experience with a pre-configured agent system, skills, and rules designed for maximum productivity.

## Features

- **36 Pre-built Agents** - Specialized agents for development, testing, documentation, and more
- **17 Skills** - Development best practices, orchestration patterns, and system utilities
- **12 Guides** - Reference documentation for various technologies
- **18 Rules** - Enforced coding standards and workflow patterns
- **Full Customization** - Create, modify, and extend agents, skills, and rules
- **Multi-language Support** - English and Korean out of the box
- **Health Checks** - Built-in doctor command to verify installation

## Quick Start

### Installation

```bash
npm install -g oh-my-customcode
```

### Initialize in Your Project

```bash
cd your-project
omcc init
```

This creates the agent system with all agents, skills, rules, and a configured `CLAUDE.md`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `omcc init` | Initialize agent system in current project |
| `omcc init --lang ko` | Initialize with Korean language |
| `omcc init --backup` | Backup existing installation before init |
| `omcc update` | Update to latest agents and skills |
| `omcc list` | List all installed components |
| `omcc list agents` | List installed agents |
| `omcc list skills` | List installed skills |
| `omcc list --format json` | Output as JSON |
| `omcc doctor` | Verify installation health |
| `omcc doctor --fix` | Auto-fix common issues |

## What's Included

### Agents (36 total)

| Category | Count | Agents |
|----------|-------|--------|
| Orchestrator | 4 | planner (master), secretary, dev-lead, qa-lead |
| Manager | 6 | creator, updater, supplier, gitnerd, sync-checker, sauron |
| System | 2 | memory-keeper, naggy |
| SW Engineer/Frontend | 3 | vercel-agent, vuejs-agent, svelte-agent |
| SW Engineer/Backend | 5 | fastapi, springboot, go-backend, express, nestjs |
| SW Engineer/Language | 6 | golang, python, rust, kotlin, typescript, java21 |
| SW Engineer/Tooling | 3 | npm-expert, optimizer, bun-expert |
| SW Architect | 2 | documenter, speckit-agent |
| Infra Engineer | 2 | docker-expert, aws-expert |
| QA Team | 3 | qa-planner, qa-writer, qa-engineer |

### Skills

- **Development** - Language-specific best practices (Go, Python, TypeScript, Kotlin, Rust, Java)
- **Backend** - Framework skills (FastAPI, Spring Boot, Express, NestJS)
- **Infrastructure** - Docker, AWS deployment skills
- **System** - Memory management, result aggregation
- **Orchestration** - Pipeline execution, intent detection

### Rules

| Priority | Description | Count |
|----------|-------------|-------|
| **MUST** | Safety, permissions, agent design, identification (enforced) | 10 |
| **SHOULD** | Interaction, error handling, memory integration (recommended) | 6 |
| **MAY** | Optimization guidelines (optional) | 2 |

## Customization

oh-my-customcode is designed for full customization. You can:

### Create Custom Agents

```bash
# Use the creator agent
creator:agent my-custom-agent --type sw-engineer
```

Or manually create in `agents/{category}/{agent-name}/`:

```
agents/sw-engineer/my-custom-agent/
├── AGENT.md       # Agent definition
├── index.yaml     # Metadata
└── refs/          # Symlinks to skills/guides
```

### Modify Rules

Edit files in `.claude/rules/`:
- `MUST-*.md` - Required rules (never violate)
- `SHOULD-*.md` - Strongly recommended
- `MAY-*.md` - Optional guidelines

### Add Custom Skills

Create in `skills/{category}/{skill-name}/`:

```
skills/development/my-skill/
├── SKILL.md       # Skill instructions
└── index.yaml     # Metadata
```

### Customize Workflows

Edit pipeline definitions in `pipelines/` or create your own.

## Project Structure

After `omcc init`, your project will have:

```
your-project/
├── CLAUDE.md              # Main entry point for Claude
├── .claude/
│   ├── rules/             # Global rules (R000-R017)
│   ├── hooks/             # Hook scripts
│   └── contexts/          # Context files
├── agents/
│   ├── orchestrator/      # planner, secretary, dev-lead, qa-lead
│   ├── manager/           # creator, updater, supplier, gitnerd, sync-checker, sauron
│   ├── system/            # memory-keeper, naggy
│   ├── sw-engineer/       # Frontend, backend, language, tooling experts
│   ├── sw-architect/      # documenter, speckit-agent
│   ├── infra-engineer/    # docker-expert, aws-expert
│   └── qa-team/           # qa-planner, qa-writer, qa-engineer
├── skills/                # Skill definitions
├── guides/                # Reference documentation
├── pipelines/             # Pipeline definitions
└── commands/              # Command definitions
```

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test

# Run linter
bun run lint

# Build
bun run build
```

## Requirements

- Node.js >= 18.0.0
- Claude Code CLI

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) - see the LICENSE file for details.

---

Made with care by [baekenough](https://github.com/baekenough)
