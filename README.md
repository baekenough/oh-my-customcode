<div align="center">
  <img src="assets/banner.webp" alt="oh-my-customcode banner" width="800" />
</div>

# oh-my-customcode

> **Your Coding Agent Stack, Your Way**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[한국어 문서 (Korean)](./README_ko.md)**

**The easiest way to customize Claude Code with agents, skills, and rules.**

Like oh-my-zsh transformed shell customization, oh-my-customcode makes personalizing your coding agent workflow simple, powerful, and fun.

## What Makes It Special

| Feature | Description |
|---------|-------------|
| **Batteries Included** | 42 agents, 66 skills, 22 guides, 18 rules, 2 hooks, 4 contexts, ontology graph - ready to use out of the box |
| **Sub-Agent Model** | Supports hierarchical agent orchestration with specialized roles |
| **Dead Simple Customization** | Create a folder + markdown file = new agent or skill |
| **Mix and Match** | Use built-in components, create your own, or combine both |
| **Non-Destructive** | Your customizations live alongside defaults, never overwritten |
| **Dynamic Agent Creation** | No matching expert? The system creates one on-the-fly, connecting relevant skills and guides |

## Quick Start

```bash
# Install globally
npm install -g oh-my-customcode

# Initialize in your project
cd your-project
omcustom init
```

That's it. You now have a fully configured agent environment.

---

## Customization First

This is what oh-my-customcode is all about. **Making your coding workflow yours.**

### Just Describe What You Need

No manual file editing. Describe what you want in natural language, and routing skills plus manager agents delegate to the right sub-agent:

```
"Create a migration review expert agent"
"Add a SQL optimization skill"
"Make code reviews stricter"
"Set up a deploy review pipeline"
```

**How it works:**

```
User (natural language)
  → secretary-routing (routing skill)
    → mgr-creator:sonnet       — scaffolds agent, registers, verifies
    → mgr-updater:sonnet       — syncs documentation
    → mgr-supplier:haiku       — checks dependencies
```

The routing chain analyzes your request, maps it to the appropriate skill and manager agent, and the selected sub-agent handles execution automatically.

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
  └── mgr-supplier:haiku       — dependency check

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

### Agents (43)

| Category | Count | Agents |
|----------|-------|--------|
| **Managers** | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
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
| **Security** | 1 | sec-codeql-expert |
| **Total** | **42** | |

### Skills (67)

| Category | Count | Skills |
|----------|-------|--------|
| **Routing** | 4 | secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing |
| **Best Practices** | 18 | go-best-practices, python-best-practices, typescript-best-practices, kotlin-best-practices, rust-best-practices, react-best-practices, fastapi-best-practices, springboot-best-practices, go-backend-best-practices, docker-best-practices, aws-best-practices, postgres-best-practices, supabase-postgres-best-practices, redis-best-practices, airflow-best-practices, dbt-best-practices, kafka-best-practices, snowflake-best-practices |
| **Development** | 6 | dev-review, dev-refactor, create-agent, intent-detection, web-design-guidelines, analysis |
| **Data Engineering** | 2 | spark-best-practices, pipeline-architecture-patterns |
| **Optimization** | 3 | optimize-analyze, optimize-bundle, optimize-report |
| **Memory** | 3 | memory-save, memory-recall, memory-management |
| **Package Management** | 3 | npm-publish, npm-version, npm-audit |
| **Operations** | 7 | update-docs, update-external, audit-agents, fix-refs, sauron-watch, monitoring-setup, claude-code-bible |
| **Utilities** | 5 | lists, help, status, result-aggregation, writing-clearly-and-concisely |
| **Quality & Workflow** | 9 | multi-model-verification, structured-dev-cycle, model-escalation, stuck-recovery, dag-orchestration, task-decomposition, worker-reviewer-pipeline, pr-auto-improve, pipeline-guards |
| **Security** | 2 | cve-triage, jinja2-prompts |
| **Research** | 1 | research |
| **Deploy** | 2 | vercel-deploy, codex-exec |
| **External** | 1 | skills-sh-search |

### Guides (23)

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

### Hooks (2)

Event-driven automation for agent lifecycle events (PreToolUse, PostToolUse, etc.).

### Contexts (4)

Shared context files for cross-agent knowledge and mode configurations.

### Packages

#### [ontology-rag](packages/ontology-rag/)

Ontology+RAG context engine for intelligent agent context loading.

| Feature | Description |
|---------|-------------|
| **Ontology Loading** | Parse YAML ontologies (agents, skills, rules) |
| **Graph Traversal** | Navigate dependency graphs with BFS and PageRank |
| **Semantic Routing** | LLM-based agent selection with keyword fallback |
| **Hybrid Search** | 4-signal ranking (keyword, graph, community, importance) |
| **Token Budget** | Adaptive budget management — reduces token usage by 75-95% |
| **MCP Server** | Direct integration with Claude Code via MCP protocol |

Automatically configured during `omcustom init` when [uv](https://docs.astral.sh/uv/) is available.

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
| `omcustom security` | Scan for security issues in hooks and configs |

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
├── CLAUDE.md              # Entry point for Claude
└── .claude/
    ├── rules/             # Behavior rules (18 total)
    ├── hooks/             # Event hooks (2 total)
    ├── contexts/          # Context files (4 total)
    ├── agents/            # Agent definitions (42 flat .md files)
    │   ├── lang-golang-expert.md
    │   ├── be-fastapi-expert.md
    │   ├── mgr-creator.md
    │   └── ...
    ├── skills/            # Skill modules (66 directories, each with SKILL.md)
    │   ├── go-best-practices/
    │   ├── react-best-practices/
    │   ├── secretary-routing/
    │   └── ...
    ├── ontology/          # Ontology knowledge graph for RAG context
    │   ├── schema.yaml
    │   ├── agents.yaml
    │   ├── skills.yaml
    │   ├── rules.yaml
    │   └── graphs/
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
- Claude Code CLI

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Your coding workflow. Your rules. Your way.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>
