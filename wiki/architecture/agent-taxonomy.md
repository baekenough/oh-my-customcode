---
title: Agent Taxonomy
type: architecture
updated: 2026-07-29
sources:
  - CLAUDE.md
  - .claude/rules/MUST-agent-design.md
related:
  - [[overview]]
  - [[skill-taxonomy]]
  - [[orchestration]]
  - [[wiki/rules/r006]]
---

# Agent Taxonomy

49 agents are organized into 12 functional categories. Each agent is a specialist "build artifact" that composes skills into a focused domain expert with a specific model, toolset, and memory scope.

## Overview

Agents live at `.claude/agents/{name}.md`. They declare their domain, model preference, allowed tools, skills they reference, and optional memory scope. The separation between agent definitions (WHAT the agent does) and skill files (HOW to do it) is enforced by [[wiki/rules/r006]].

## Category Breakdown

### Language Experts (6)
Core language specialists covering the full implementation layer.

| Agent | Language | Key Skills |
|-------|----------|-----------|
| [[wiki/agents/lang-golang-expert]] | Go | go-best-practices |
| [[wiki/agents/lang-python-expert]] | Python | python-best-practices |
| [[wiki/agents/lang-rust-expert]] | Rust | rust-best-practices |
| [[wiki/agents/lang-kotlin-expert]] | Kotlin | kotlin-best-practices |
| [[wiki/agents/lang-typescript-expert]] | TypeScript | typescript-best-practices |
| [[wiki/agents/lang-java-expert]] | Java 25 LTS | java-best-practices |

### Backend Experts (6)
Framework specialists that compose language skills with framework-specific patterns.

| Agent | Framework | Typical Model |
|-------|-----------|--------------|
| [[wiki/agents/be-fastapi-expert]] | FastAPI | claude-sonnet-5 |
| [[wiki/agents/be-springboot-expert]] | Spring Boot | claude-sonnet-5 |
| [[wiki/agents/be-go-backend-expert]] | Go backend | claude-sonnet-5 |
| [[wiki/agents/be-express-expert]] | Express.js | claude-sonnet-5 |
| [[wiki/agents/be-nestjs-expert]] | NestJS | claude-sonnet-5 |
| [[wiki/agents/be-django-expert]] | Django | claude-sonnet-5 |

### Frontend Experts (5)
UI and client-side specialists.

| Agent | Domain |
|-------|--------|
| [[wiki/agents/fe-vercel-agent]] | Next.js / Vercel deployment |
| [[wiki/agents/fe-vuejs-agent]] | Vue.js |
| [[wiki/agents/fe-svelte-agent]] | Svelte |
| [[wiki/agents/fe-flutter-agent]] | Flutter / Dart |
| [[wiki/agents/fe-design-expert]] | UI design systems |

### Data Engineering (6)
Pipeline and data platform specialists.

`de-airflow-expert`, `de-dbt-expert`, `de-spark-expert`, `de-kafka-expert`, `de-snowflake-expert`, `de-pipeline-expert`

Routed via `de-lead-routing` skill.

### Database Experts (4)
Storage layer specialists: `db-supabase-expert`, `db-postgres-expert`, `db-redis-expert`, `db-alembic-expert`

### Tooling (4)
Build and toolchain: `tool-npm-expert`, `tool-optimizer`, `tool-bun-expert`, `slack-cli-expert`

### Manager Agents (6)
System maintenance and coordination layer.

| Agent | Role |
|-------|------|
| [[wiki/agents/mgr-creator]] | Create agents/skills/guides (R010 Protected Paths) |
| [[wiki/agents/mgr-sauron]] | R017 structural verification ("all-seeing eye") |
| [[wiki/agents/mgr-gitnerd]] | All git operations |
| [[wiki/agents/mgr-updater]] | Sync agents from external sources |
| [[wiki/agents/mgr-supplier]] | Dependency auditing |
| [[wiki/agents/mgr-claude-code-bible]] | Official CC spec compliance |

### Other Categories

| Category | Agents | Notes |
|----------|--------|-------|
| Security | `sec-codeql-expert` | CodeQL analysis |
| Architect | `arch-documenter`, `arch-speckit-agent` | Docs and specs |
| Infra | `infra-docker-expert`, `infra-aws-expert` | Deploy and cloud |
| QA | `qa-planner`, `qa-writer`, `qa-engineer` | Full QA lifecycle |
| System | `sys-memory-keeper`, `sys-naggy` | Session memory and task tracking |

## Model Selection Patterns

Model specification is 3-tier (see [[wiki/rules/r006]] "3-tier model specification"): Tier 1 native alias (`sonnet`/`opus`/`haiku`/`opusplan`, resolved by CC itself, valid in both frontmatter and Agent-tool params), Tier 2 full model ID (frontmatter only, recommended — what all 49 project agents actually use), Tier 3 Agent-tool `model` param enum (`sonnet`\|`opus`\|`haiku`\|`fable` only, used by routing-skill spawn instructions). `sonnet5`/`opus5`/`opus48` are **not real values in any tier** — CC does not interpret them; a spawn using them fails.

| Frontmatter value (Tier 2, actual) | Use Case | Example Agents |
|-------------------------------------|----------|---------------|
| `haiku` | Fast, cheap: search, simple edits | mgr-supplier, sys-naggy, tracker-checkpoint (3 of 49) |
| `sonnet` (Tier-1 alias, CC-resolved — not pinned by this project) | General code generation, legacy usage | None currently — project agents migrated to `claude-sonnet-5` |
| `claude-sonnet-5` | General code generation (CC default model, v2.1.197+) | Most language/backend/manager agents (41 of 49) |
| `opus` (Tier-1 alias, CC-resolved — not pinned by this project) | Complex reasoning, legacy usage | None currently — elevated agents migrated to `claude-opus-5` |
| `claude-opus-5` | Complex reasoning, elevated structural verification (CC default Opus, v2.1.219+) | mgr-sauron, sec-codeql-expert, db-alembic-expert, de-pipeline-expert, infra-aws-expert (5 of 49) |
| `opusplan` | Architecture planning with approval gates | None currently assigned — 0 project agents use `opusplan` (arch-speckit-agent runs `claude-sonnet-5`) |

## Cross-Category Relationships

Backend agents depend on their corresponding language agent's skills. The manager layer (mgr-*) provides meta-services to all categories. QA agents receive work products from any category and return verified results to the orchestrator.

## Relationships

- **Depends on**: [[wiki/rules/r006]] (agent design standards), [[skill-taxonomy]] (skills agents reference)
- **Used by**: [[orchestration]] (routing to agents), [[development-workflow]]
- **See also**: [[skill-taxonomy]], [[overview]]

## Sources

- `CLAUDE.md` — agent summary table with counts and names
- `.claude/rules/MUST-agent-design.md` — R006 frontmatter and model alias table
