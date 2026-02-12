<div align="center">
  <img src="assets/banner.webp" alt="oh-my-customcode banner" width="800" />
</div>

# oh-my-customcode

> **Your Claude Code, Your Way**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[한국어 문서 (Korean)](./README_ko.md)**

**The easiest way to customize Claude Code with agents, skills, and rules.**

Like oh-my-zsh transformed shell customization, oh-my-customcode makes personalizing your Claude Code experience simple, powerful, and fun.

## What Makes It Special

| Feature | Description |
|---------|-------------|
| **Batteries Included** | 42 agents, 51 skills, 22 guides, 18 rules, 1 hook, 4 contexts - ready to use out of the box |
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

> **Codex CLI Support**: Experimental Codex CLI mode is available. See `AGENTS.md` and `.codex/` for Codex-native configuration.

## Customization First

This is what oh-my-customcode is all about. **Making Claude Code yours.**

### Just Tell Claude What You Need

No manual file editing. Describe what you want in natural language, and the orchestrator delegates to the right agent:

```
"Create a migration review expert agent"
"Add a SQL optimization skill"
"Make code reviews stricter"
"Set up a deploy review pipeline"
```

**How it works:**

```
User (natural language)
  → /create-agent (routing skill)
    → mgr-creator:sonnet       — scaffolds agent, registers, verifies
    → mgr-updater:sonnet       — syncs documentation
    → mgr-supplier:haiku       — checks dependencies
```

Claude Code's routing system analyzes your request, routes it to the appropriate skill and agent, and the sub-agent handles everything automatically.

### Sub-Agent Model

Each sub-agent runs on an optimized model for its task type:

| Model | Usage | Examples |
|-------|-------|---------|
| `opus` | Complex reasoning, architecture | Code review, design analysis |
| `sonnet` | General tasks (default) | Agent creation, code generation |
| `haiku` | Fast, simple operations | File search, validation |

Claude Code selects the appropriate model and parallelizes independent tasks (up to 4 concurrent sub-agents):

```
/create-agent
  ├── mgr-creator:sonnet       — agent scaffolding
  ├── mgr-supplier:haiku       — dependency check
  └── mgr-sync-checker:haiku   — registry verification

/code-review
  ├── lang-golang-expert:sonnet — Go implementation
  ├── lang-python-expert:sonnet — Python implementation
  └── qa-engineer:sonnet        — test generation
```

### Built-in Commands

| Command | Agent | Description |
|---------|-------|-------------|
| `/create-agent <name>` | mgr-creator | Create a new agent |
| `/update-docs` | mgr-updater | Sync docs with project structure |
| `/audit-agents` | mgr-supplier | Verify agent dependencies |
| `/dev-review` | lang-* experts | Review code with expert agents |
| `/sauron-watch` | mgr-sauron | Full synchronization check |

---

## What's Included

### Agents (42)

| Category | Count | Agents |
|----------|-------|--------|
| **Managers** | 7 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sync-checker, mgr-sauron, mgr-claude-code-bible |
| **System** | 2 | sys-memory-keeper, sys-naggy |
| **Languages** | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| **Frontend** | 3 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent |
| **Backend** | 5 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert |
| **Tooling** | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| **Data Engineering** | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| **Database** | 3 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| **Architecture** | 2 | arch-documenter, arch-speckit-agent |
| **Infrastructure** | 2 | infra-docker-expert, infra-aws-expert |
| **QA** | 3 | qa-planner, qa-writer, qa-engineer |
| **Total** | **42** | |

### Skills (51)

Includes slash commands and capabilities:

- **Development** (8): Go, Python, TypeScript, Kotlin, Rust, Java, React, Vercel
- **Backend** (5): FastAPI, Spring Boot, Express, NestJS, Go Backend
- **Data Engineering** (6): Airflow, dbt, Spark, Kafka, Snowflake, Pipeline
- **Database** (3): Supabase, PostgreSQL, Redis
- **Infrastructure** (2): Docker, AWS
- **System** (2): Memory management, result aggregation
- **Orchestration** (4): secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing
- **Slash Commands** (20+): /create-agent, /code-review, /audit-dependencies, /sync-check, /commit, /pr, and more

### Guides (22)

Comprehensive reference documentation covering:
- Agent creation and management
- Skill development
- Pipeline workflows
- Best practices and patterns
- Sub-agent orchestration
- Data engineering workflows
- Database optimization

### Rules (18)

| Priority | Count | Purpose |
|----------|-------|---------|
| **MUST** | 11 | Safety, permissions, agent design (enforced) |
| **SHOULD** | 5 | Interactions, error handling (recommended) |
| **MAY** | 1 | Optimization guidelines (optional) |

### Hooks (1)

Event-driven automation for Claude Code lifecycle events (PreToolUse, PostToolUse, etc.).

### Contexts (4)

Shared context files for cross-agent knowledge and mode configurations.

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

**Global Options:**
| Option | Description |
|--------|-------------|
| `--skip-version-check` | Skip CLI tool version pre-flight check |
| `-v, --version` | Show version number |
| `-h, --help` | Show help |

---

## Project Structure

After `omcustom init`:

```
your-project/
├── CLAUDE.md              # Entry point for Claude (or AGENTS.md for Codex)
└── .claude/               # (or .codex/)
    ├── rules/             # Behavior rules (18 total)
    ├── hooks/             # Event hooks (1 total)
    ├── contexts/          # Context files (4 total)
    ├── agents/            # Agent definitions (42 flat .md files)
    │   ├── lang-golang-expert.md
    │   ├── be-fastapi-expert.md
    │   ├── mgr-creator.md
    │   └── ...
    ├── skills/            # Skill modules (51 directories, each with SKILL.md)
    │   ├── go-best-practices/
    │   ├── react-best-practices/
    │   ├── secretary-routing/
    │   └── ...
    └── guides/            # Reference docs (22 total)
```

---

## Development

```bash
bun install          # Install dependencies
bun run dev          # Development mode
bun test             # Run tests
bun run build        # Build for production
```

### Quality Gates

| Gate | Tool | Threshold |
|------|------|-----------|
| Lint | Biome | Zero errors (complexity enforced) |
| Test Coverage | Bun test | 95% (pre-commit), 97% (CI) |
| Security Audit | bun pm audit | No high/critical vulnerabilities |
| Dependabot | GitHub | Weekly scans, auto-PR for updates |

Pre-commit hooks automatically enforce lint, test, and coverage gates before each commit.

### Requirements

- Node.js >= 18.0.0
- Claude Code CLI or OpenAI Codex CLI

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
