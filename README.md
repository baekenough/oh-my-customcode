# oh-my-customcode

> **Your Claude Code, Your Way**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)

**The easiest way to customize Claude Code with agents, skills, and rules.**

Like oh-my-zsh transformed shell customization, oh-my-customcode makes personalizing your Claude Code experience simple, powerful, and fun.

## What Makes It Special

| Feature | Description |
|---------|-------------|
| **Batteries Included** | 37 agents, 17 skills, 12 guides - synced with baekgom-agents templates |
| **Sub-Agent Model** | Supports hierarchical agent orchestration with specialized roles |
| **Dead Simple Customization** | Create a folder + markdown file = new agent or skill |
| **Mix and Match** | Use built-in components, create your own, or combine both |
| **Non-Destructive** | Your customizations live alongside defaults, never overwritten |

## Quick Start

```bash
# Install globally
npm install -g oh-my-customcode

# Initialize in your project
cd your-project
omcustom init
```

That's it. You now have a fully configured Claude Code environment.

---

## Customization First

This is what oh-my-customcode is all about. **Making Claude Code yours.**

### Create a Custom Agent

Want an agent that reviews database migrations? Just tell Claude Code:

```
creator:agent migration-expert --type sw-engineer
```

The creator agent scaffolds the full structure, registers it, and verifies dependencies automatically.

**What gets created:**
```
agents/sw-engineer/migration-expert/
├── AGENT.md       # What the agent does
└── index.yaml     # Metadata
```

Other useful management commands:

| Command | Description |
|---------|-------------|
| `creator:agent <name>` | Create a new agent |
| `updater:docs` | Sync documentation with project structure |
| `supplier:audit` | Verify agent dependencies |

### Add a Custom Skill

Skills define **how** agents do things. Create specialized knowledge:

```
creator:agent migration-expert --type sw-engineer
```

The creator agent can also scaffold skills. The generated structure:

```
skills/development/sql-optimization/
├── SKILL.md       # The skill instructions
└── index.yaml     # Metadata
```

### Modify Rules

Rules control behavior. Edit them in `.claude/rules/`:

```
.claude/rules/
├── MUST-*.md      # Required (safety, permissions)
├── SHOULD-*.md    # Recommended (interactions, error handling)
└── MAY-*.md       # Optional (optimizations)
```

Want stricter code review? Edit `SHOULD-interaction.md`:

```markdown
## Code Review Standards

### Before Approving Any Code
- [ ] All tests pass
- [ ] No security vulnerabilities
- [ ] Performance impact assessed
- [ ] Documentation updated
```

### Create Custom Pipelines

Define repeatable workflows in `pipelines/`:

```yaml
# pipelines/deploy-review.yaml
name: deploy-review
description: Pre-deployment review workflow

steps:
  - id: security_scan
    agent: qa-lead
    action: security_review

  - id: performance_check
    agent: optimizer
    action: analyze_performance

  - id: migration_review
    agent: migration-expert  # Your custom agent!
    action: review_migrations
```

Run it: `pipeline:run deploy-review`

### Mix Built-in + Custom

The real power is combining everything:

```
your-project/
├── agents/
│   ├── orchestrator/          # Built-in: planner, secretary
│   ├── sw-engineer/
│   │   ├── language/          # Built-in: golang, python, rust...
│   │   └── migration-expert/  # YOUR custom agent
│   └── your-team/             # YOUR team-specific agents
├── skills/
│   ├── development/           # Built-in: best practices
│   └── your-company/          # YOUR company standards
└── .claude/rules/
    ├── MUST-safety.md         # Built-in
    └── MUST-your-policy.md    # YOUR company policy
```

---

## What's Included

> **Templates synced from [baekgom-agents](https://github.com/baekenough/baekgom-agents)** - Battle-tested agent system with sub-agent orchestration support.

### Agents (37)

| Category | Count | Agents |
|----------|-------|--------|
| **Orchestrators** | 4 | planner, secretary, dev-lead, qa-lead |
| **Managers** | 6 | creator, updater, supplier, gitnerd, sync-checker, sauron |
| **System** | 2 | memory-keeper, naggy |
| **Languages** | 6 | golang, python, rust, kotlin, typescript, java21 |
| **Frontend** | 3 | vercel-agent, vuejs-agent, svelte-agent |
| **Backend** | 5 | fastapi, springboot, go-backend, express, nestjs |
| **Tooling** | 3 | npm-expert, optimizer, bun-expert |
| **Architecture** | 2 | documenter, speckit-agent |
| **Infrastructure** | 2 | docker-expert, aws-expert |
| **QA** | 3 | qa-planner, qa-writer, qa-engineer |
| **Tutor** | 1 | go-tutor |
| **Total** | **37** | |

### Skills (17)

- **Development** (8): Go, Python, TypeScript, Kotlin, Rust, Java, React, Vercel
- **Backend** (5): FastAPI, Spring Boot, Express, NestJS, Go Backend
- **Infrastructure** (2): Docker, AWS
- **System** (2): Memory management, result aggregation
- **Orchestration** (2): Pipeline execution, intent detection

### Guides (12)

Comprehensive reference documentation covering:
- Agent creation and management
- Skill development
- Pipeline workflows
- Best practices and patterns

### Rules (18)

| Priority | Count | Purpose |
|----------|-------|---------|
| **MUST** | 10 | Safety, permissions, agent design (enforced) |
| **SHOULD** | 6 | Interactions, error handling (recommended) |
| **MAY** | 2 | Optimization guidelines (optional) |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `omcustom init` | Initialize in current project |
| `omcustom init --lang ko` | Initialize with Korean language |
| `omcustom update` | Update to latest version |
| `omcustom list` | List all installed components |
| `omcustom list agents` | List agents only |
| `omcustom doctor` | Verify installation health |
| `omcustom doctor --fix` | Auto-fix common issues |

---

## Project Structure

After `omcustom init`:

```
your-project/
├── CLAUDE.md              # Entry point for Claude
├── .claude/
│   ├── rules/             # Behavior rules
│   ├── hooks/             # Event hooks
│   └── contexts/          # Context files
├── agents/                # All agents
├── skills/                # All skills
├── guides/                # Reference docs
├── pipelines/             # Workflow definitions
└── commands/              # Command definitions
```

---

## Development

```bash
bun install          # Install dependencies
bun run dev          # Development mode
bun test             # Run tests
bun run build        # Build for production
```

### Requirements

- Node.js >= 18.0.0
- Claude Code CLI

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Your Claude Code. Your rules. Your way.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>
