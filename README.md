<div align="center">
  <img src="assets/banner.webp" alt="oh-my-customcode banner" width="800" />
</div>

# oh-my-customcode

> **Your AI Agent Stack. Compiled, Not Configured.**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[한국어 문서 (Korean)](./README_ko.md)**

44 agents. 75 skills. 21 rules. One command.

```bash
npm install -g oh-my-customcode && cd your-project && omcustom init
```

---

## What's New in v0.38.0

| Feature | Description |
|---------|-------------|
| **Interactive Init Wizard** | `omcustom init` now uses `@clack/prompts` for guided setup — language, framework, team mode |
| **PostCompact Hook** | Automatic rule reinforcement after context compaction (CC v2.1.76+) — prevents rule amnesia |
| **@omcustom/eval-core MVP** | LLM evaluation engine: session/turn/outcome collection, SQLite via Drizzle ORM, CLI interface |
| **Codex-exec Auto-delegation** | Routing skills automatically delegate to Codex when available |
| **CC v2.1.72~v2.1.76 Compatibility** | SessionEnd timeout config, HTML comment optimization, `autoMemoryDirectory`, full model ID support |
| **Template Full Sync** | All 200+ template files are byte-identical to source |
| **Hook System Hardening** | Duplicate recorder removal, context-budget field fix, orphan cleanup |

---

## Philosophy

oh-my-customcode is built on two ideas:

**1. Agent systems are compiled, not configured.**

| Compile Concept | oh-my-customcode |
|----------------|-----------------|
| Source code | `.claude/skills/` — reusable knowledge and workflows |
| Build artifacts | `.claude/agents/` — executable specialists assembled from skills |
| Compiler | `mgr-sauron` (R017) — structural verification and integrity |
| Spec | `.claude/rules/` — constraints and build rules |
| Linker | Routing skills — connect agents to tasks |
| Standard library | `guides/` — shared reference documentation |

Skills are source. Agents are compiled output. Sauron verifies the build. This separation means skills evolve independently of agents, and agents can be recompiled from updated skills at any time.

**2. If it can't be done, make it work.**

When no specialist exists for a task, oh-my-customcode does not fail. It creates one.

```
User: "Review this Terraform module"
  → Routing: no terraform expert found
  → mgr-creator discovers: infra-aws-expert skills + docker-best-practices guide
  → Creates: infra-terraform-expert.md
  → Executes the review immediately
  → Agent persists for future use
```

This is not a fallback. It is the design. The system treats missing expertise as a build problem — find the right skills, compile a new agent, execute.

---

## How It Works

### Orchestration

The main conversation acts as a singleton orchestrator (R010). It never writes files directly. Every action is delegated through routing skills to specialized agents.

```
User (natural language)
  → Routing skill (intent detection, confidence scoring)
    → Specialized agent (isolated execution)
      → Result returned to orchestrator
        → Response to user
```

Four routing skills cover the full domain:

| Routing Skill | Routes To |
|--------------|-----------|
| secretary-routing | Manager agents (mgr-*), system agents (sys-*) |
| dev-lead-routing | Language, backend, frontend, tooling, DB, infra, arch agents |
| de-lead-routing | Data engineering agents (de-*) |
| qa-lead-routing | QA team (qa-planner, qa-writer, qa-engineer) |

### Model Selection

Each agent runs on the model optimized for its task:

| Model | When | Examples |
|-------|------|---------|
| `opus` | Complex reasoning, architecture | Design review, research synthesis |
| `sonnet` | Implementation, general tasks | Code generation, agent creation |
| `haiku` | Fast validation, search | File search, count verification |

The reasoning-sandwich pattern formalizes this: opus for pre-analysis, sonnet for implementation, haiku for post-verification.

### Parallel Execution

Independent tasks run in parallel (R009). Up to 4 concurrent agents per message:

```
Agent(lang-golang-expert):sonnet  ┐
Agent(lang-python-expert):sonnet  ├─ All spawned in one message
Agent(qa-engineer):sonnet         │
Agent(arch-documenter):haiku      ┘
```

---

### Agents (44)

| Category | Count | Agents |
|----------|-------|--------|
| Languages | 6 | lang-golang, lang-python, lang-rust, lang-kotlin, lang-typescript, lang-java21 |
| Backend | 6 | be-fastapi, be-springboot, be-go-backend, be-express, be-nestjs, be-django |
| Frontend | 4 | fe-vercel, fe-vuejs, fe-svelte, fe-flutter |
| Data Engineering | 6 | de-airflow, de-dbt, de-spark, de-kafka, de-snowflake, de-pipeline |
| Database | 3 | db-supabase, db-postgres, db-redis |
| Tooling | 3 | tool-npm, tool-optimizer, tool-bun |
| Architecture | 2 | arch-documenter, arch-speckit |
| Infrastructure | 2 | infra-docker, infra-aws |
| QA | 3 | qa-planner, qa-writer, qa-engineer |
| Security | 1 | sec-codeql |
| Managers | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| System | 2 | sys-memory-keeper, sys-naggy |

Each agent declares its tools, model, memory scope, and limitations in YAML frontmatter. Tool budgets are enforced per agent type for accuracy.

---

### Skills (75)

| Category | Count | Includes |
|----------|-------|----------|
| Best Practices | 23 | Go, Python, TypeScript, Kotlin, Rust, React, FastAPI, Spring Boot, Django, Flutter, Docker, AWS, Postgres, Redis, Kafka, dbt, Spark, Snowflake, Airflow, pipeline-architecture-patterns, and more |
| Routing | 4 | secretary, dev-lead, de-lead, qa-lead |
| Workflow | 12 | structured-dev-cycle, deep-plan, research, evaluator-optimizer, dag-orchestration, worker-reviewer-pipeline, reasoning-sandwich, and more |
| Development | 7 | dev-review, dev-refactor, analysis, create-agent, intent-detection, web-design-guidelines, omcustom-takeover |
| Operations | 9 | update-docs, audit-agents, sauron-watch, monitoring-setup, fix-refs, release-notes, and more |
| Memory | 3 | memory-save, memory-recall, memory-management |
| Package | 3 | npm-publish, npm-version, npm-audit |
| Optimization | 3 | optimize-analyze, optimize-bundle, optimize-report |
| Security | 3 | adversarial-review, cve-triage, jinja2-prompts |
| Other | 8 | codex-exec, vercel-deploy, skills-sh-search, result-aggregation, writing-clearly-and-concisely, and more |

Skills use a 3-tier scope system: `core` (universal), `harness` (agent/skill maintenance), `package` (project-specific).

---

## Commands

All commands are invoked inside the Claude Code conversation.

### Development

| Command | What it does |
|---------|-------------|
| `/dev-review` | Code review against best practices |
| `/dev-refactor` | Refactor for structure and patterns |
| `/structured-dev-cycle` | 6-stage development: plan → verify → implement → verify → compound → done |
| `/deep-plan` | Research-validated planning |
| `/research` | 10-team parallel analysis with cross-verification |

### Agent Management

| Command | What it does |
|---------|-------------|
| `/omcustom:analysis` | Analyze project, auto-configure agents and skills |
| `/omcustom:create-agent` | Create a new agent |
| `/omcustom:takeover` | Extract canonical spec from existing agent or skill |
| `/omcustom:audit-agents` | Audit agent dependencies |
| `/omcustom:update-docs` | Sync project structure and documentation |
| `/omcustom:sauron-watch` | Full structural verification (5+3 rounds) |

### Package & Release

| Command | What it does |
|---------|-------------|
| `/omcustom:npm-publish` | Publish to npm |
| `/omcustom:npm-version` | Semantic versioning |
| `/omcustom:npm-audit` | Dependency security audit |
| `/omcustom:release-notes` | Generate release notes from git history |

### Memory & System

| Command | What it does |
|---------|-------------|
| `/memory-save` | Save session context |
| `/memory-recall` | Search and recall memories |
| `/omcustom:monitoring-setup` | OTel monitoring toggle |
| `/omcustom:lists` | Show all commands |
| `/omcustom:status` | System health check |

---

### Rules (21)

| Priority | Count | Purpose |
|----------|-------|---------|
| **MUST** | 14 | Safety, permissions, agent design, identification, orchestration, verification, completion, enforcement |
| **SHOULD** | 6 | Interaction, error handling, memory, HUD, ecomode, ontology routing |
| **MAY** | 1 | Optimization |

Key rules: R010 (orchestrator never writes files), R009 (parallel execution mandatory), R017 (sauron verification before push), R020 (completion verification before declaring done), R021 (advisory-first enforcement model).

---

### Guides (25)

Reference documentation covering best practices, architecture decisions, and integration patterns. Located in `guides/` at project root, covering topics from agent design to CI/CD to observability.

---

## Safety

oh-my-customcode includes security and lifecycle hooks:

| Hook | Trigger | Action |
|------|---------|--------|
| secret-filter | Bash, Read output | Detects AWS keys, API tokens, private keys, bearer tokens |
| audit-log | Edit, Write, Bash, Agent | Append-only JSONL at `~/.claude/audit.jsonl` |
| schema-validator | Write, Edit, Bash input | Validates tool inputs, flags dangerous patterns |
| PostCompact | Context compaction | Reinjects enforced rules (R007–R018) — prevents rule amnesia |

Security hooks are advisory (exit 0). They warn but never block.

---

## CLI

```bash
omcustom init                  # Interactive setup wizard (language, framework, team mode)
omcustom init --lang ko        # Initialize with Korean
omcustom update                # Update to latest
omcustom list                  # List components
omcustom doctor                # Verify installation
omcustom doctor --fix          # Auto-fix issues
omcustom security              # Scan for security issues
```

---

## Project Structure

```
your-project/
├── CLAUDE.md                   # Entry point
├── .claude/
│   ├── agents/                 # 44 agent definitions
│   ├── skills/                 # 75 skill modules
│   ├── rules/                  # 21 governance rules (R000-R021)
│   ├── hooks/                  # 15 lifecycle hook scripts
│   ├── schemas/                # Tool input validation schemas
│   ├── specs/                  # Extracted canonical specs
│   ├── contexts/               # 4 shared context files
│   └── ontology/               # Knowledge graph for RAG
└── guides/                     # 25 reference documents
```

---

## Development

```bash
bun install          # Install dependencies
bun run dev          # Development mode
bun test             # Run tests
bun run build        # Production build
```

Requirements: Node.js >= 18.0.0, Claude Code CLI.

---

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>No expert? Create one. Connect knowledge. Execute.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>
