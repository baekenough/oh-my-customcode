# oh-my-customcode

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)

**Batteries-included agent harness for Claude Code**

Transform your Claude Code experience with a pre-configured agent system, skills, and rules designed for maximum productivity.

## Features

- **28 Pre-built Agents** - Specialized agents for development, testing, documentation, and more
- **Organized Skills** - Development, backend, infrastructure, and orchestration skills
- **Enforced Rules** - MUST/SHOULD/MAY priority rules for consistent behavior
- **Multi-language Support** - English and Korean out of the box
- **Easy Setup** - Single command initialization
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

This creates the `.claude/` directory with all agents, skills, rules, and a configured `CLAUDE.md`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `omcc init` | Initialize agent system in current project |
| `omcc init --lang ko` | Initialize with Korean language |
| `omcc update` | Update to latest agents and skills |
| `omcc list` | List all installed components |
| `omcc list agents` | List installed agents |
| `omcc list skills` | List installed skills |
| `omcc doctor` | Verify installation health |
| `omcc doctor --fix` | Auto-fix common issues |

## What's Included

### Agents (28 total)

| Category | Agents |
|----------|--------|
| Master | planner |
| Orchestrator | secretary, dev-lead |
| Manager | creator, updater, supplier, naggy, git-expert, sync-checker |
| System | memory-keeper |
| SW Engineer | golang, python, rust, kotlin, typescript, java21, vercel-frontend |
| SW Architect | documenter, speckit-agent |
| Backend Engineer | fastapi, springboot, go-backend, express, nestjs |
| Infra Engineer | docker, aws |
| QA Engineer | qa-lead |
| Tutor | go-tutor |

### Skills

- **Development** - Language-specific best practices (Go, Python, TypeScript, etc.)
- **Backend** - Framework skills (FastAPI, Spring Boot, Express, NestJS)
- **Infrastructure** - Docker, AWS deployment skills
- **System** - Memory management, result aggregation
- **Orchestration** - Pipeline execution, intent detection

### Rules

- **MUST** - Safety, permissions, agent design, identification (enforced)
- **SHOULD** - Interaction, error handling, memory integration (recommended)
- **MAY** - Optimization guidelines (optional)

## Configuration

After initialization, customize behavior via `.omccrc.json`:

```json
{
  "language": "en",
  "agents": {
    "enabled": ["*"],
    "disabled": []
  },
  "rules": {
    "strict": true
  }
}
```

## Project Structure

After `omcc init`, your project will have:

```
your-project/
├── CLAUDE.md              # Main configuration
├── .claude/
│   ├── rules/             # MUST/SHOULD/MAY rules
│   ├── hooks/             # Lifecycle hooks
│   └── contexts/          # Context configurations
├── agents/                # Agent definitions
├── skills/                # Skill definitions
├── guides/                # Reference documentation
└── commands/              # Command definitions
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
