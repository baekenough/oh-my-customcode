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
| **Batteries Included** | 36 agents, 17 skills, 18 rules - ready to use out of the box |
| **Dead Simple Customization** | Create a folder + markdown file = new agent or skill |
| **Mix and Match** | Use built-in components, create your own, or combine both |
| **Non-Destructive** | Your customizations live alongside defaults, never overwritten |

## Quick Start

```bash
# Install globally
npm install -g oh-my-customcode

# Initialize in your project
cd your-project
omcc init
```

That's it. You now have a fully configured Claude Code environment.

---

## Customization First

This is what oh-my-customcode is all about. **Making Claude Code yours.**

### Create a Custom Agent (2 files)

Want an agent that reviews database migrations? Just create:

```
agents/sw-engineer/migration-expert/
├── AGENT.md       # What the agent does
└── index.yaml     # Metadata
```

**AGENT.md:**
```markdown
# Migration Expert Agent

> **Type**: Worker

## Purpose

Expert in database migrations, schema design, and data integrity.

## Capabilities

1. Review migration files for safety issues
2. Suggest rollback strategies
3. Check for data loss risks
4. Optimize migration performance

## When to Use

- Before running migrations in production
- Designing new database schemas
- Reviewing team members' migrations
```

**index.yaml:**
```yaml
metadata:
  name: migration-expert
  type: worker
  category: sw-engineer
  description: Database migration specialist
```

Done. Your custom agent is ready to use.

### Add a Custom Skill

Skills define **how** agents do things. Create specialized knowledge:

```
skills/development/sql-optimization/
├── SKILL.md       # The skill instructions
└── index.yaml     # Metadata
```

**SKILL.md:**
```markdown
# SQL Optimization Skill

## Rules

### Query Optimization
- Always use EXPLAIN ANALYZE before suggesting changes
- Prefer indexes over full table scans
- Avoid SELECT * in production code
- Use CTEs for complex queries

### Migration Safety
- Always include rollback scripts
- Test migrations on production-like data
- Never delete columns without deprecation period
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

### Agents (36)

| Category | Agents |
|----------|--------|
| Orchestrators | planner, secretary, dev-lead, qa-lead |
| Managers | creator, updater, supplier, gitnerd, sync-checker, sauron |
| System | memory-keeper, naggy |
| Languages | golang, python, rust, kotlin, typescript, java21 |
| Frontend | vercel-agent, vuejs-agent, svelte-agent |
| Backend | fastapi, springboot, go-backend, express, nestjs |
| Tooling | npm-expert, optimizer, bun-expert |
| Architecture | documenter, speckit-agent |
| Infrastructure | docker-expert, aws-expert |
| QA | qa-planner, qa-writer, qa-engineer |

### Skills (17)

- **Development**: Go, Python, TypeScript, Kotlin, Rust, Java, React, Vercel
- **Backend**: FastAPI, Spring Boot, Express, NestJS, Go Backend
- **Infrastructure**: Docker, AWS
- **System**: Memory management, result aggregation
- **Orchestration**: Pipeline execution, intent detection

### Rules (18)

| Priority | Count | Purpose |
|----------|-------|---------|
| MUST | 10 | Safety, permissions, agent design (enforced) |
| SHOULD | 6 | Interactions, error handling (recommended) |
| MAY | 2 | Optimization guidelines (optional) |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `omcc init` | Initialize in current project |
| `omcc init --lang ko` | Initialize with Korean language |
| `omcc update` | Update to latest version |
| `omcc list` | List all installed components |
| `omcc list agents` | List agents only |
| `omcc doctor` | Verify installation health |
| `omcc doctor --fix` | Auto-fix common issues |

---

## Project Structure

After `omcc init`:

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
