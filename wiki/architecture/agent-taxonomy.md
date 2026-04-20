---
title: Agent Taxonomy
type: architecture
updated: 2026-04-12
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

47 agents are organized into 12 functional categories. Each agent is a specialist "build artifact" that composes skills into a focused domain expert with a specific model, toolset, and memory scope.

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
| [[wiki/agents/be-fastapi-expert]] | FastAPI | sonnet |
| [[wiki/agents/be-springboot-expert]] | Spring Boot | sonnet |
| [[wiki/agents/be-go-backend-expert]] | Go backend | sonnet |
| [[wiki/agents/be-express-expert]] | Express.js | sonnet |
| [[wiki/agents/be-nestjs-expert]] | NestJS | sonnet |
| [[wiki/agents/be-django-expert]] | Django | sonnet |

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

| Model | Use Case | Example Agents |
|-------|----------|---------------|
| `haiku` | Fast, cheap: search, simple edits | Explore-type tasks |
| `sonnet` | General code generation (default) | Most language/backend agents |
| `opus` | Complex reasoning, architecture | mgr-sauron deep review, arch agents |
| `opusplan` | Architecture planning with approval gates | arch-speckit-agent |

## Cross-Category Relationships

Backend agents depend on their corresponding language agent's skills. The manager layer (mgr-*) provides meta-services to all categories. QA agents receive work products from any category and return verified results to the orchestrator.

## Relationships

- **Depends on**: [[wiki/rules/r006]] (agent design standards), [[skill-taxonomy]] (skills agents reference)
- **Used by**: [[orchestration]] (routing to agents), [[development-workflow]]
- **See also**: [[skill-taxonomy]], [[overview]]

## Sources

- `CLAUDE.md` — agent summary table with counts and names
- `.claude/rules/MUST-agent-design.md` — R006 frontmatter and model alias table
