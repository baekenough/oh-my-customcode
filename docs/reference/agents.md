# Agents Reference

oh-my-customcode includes 50 pre-built agents organized by category.

## Overview

| Category (name prefix) | Count | Purpose |
|-----------------------|-------|---------|
| Manager (`mgr-`) | 6 | System management and automation |
| System (`sys-`) | 2 | Core system functionality |
| Frontend (`fe-`) | 5 | Frontend development |
| Backend (`be-`) | 6 | Backend development |
| Language (`lang-`) | 6 | Language-specific expertise |
| Tooling (`tool-`) | 3 | Build tools and optimization |
| Database (`db-`) | 4 | Database expertise |
| Data Engineering (`de-`) | 6 | Data pipelines and warehouses |
| Architecture (`arch-`) | 2 | Architecture and documentation |
| Infrastructure (`infra-`) | 2 | Infrastructure and DevOps |
| QA (`qa-`) | 3 | Quality assurance |
| Security (`sec-`) | 1 | Security analysis |
| Other | 4 | `agora-runner`, `slack-cli-expert`, `tracker-checkpoint`, `wiki-curator` |

Counts are derived from `.claude/agents/*.md` name prefixes. For the authoritative list see `wiki/agents/` (50 pages) or `.claude/agents/` (50 `.md` files); the sections below cover a representative subset, not all 50 agents.

## Manager Agents

Managers handle system-level operations and automation.

### mgr-creator

**Role**: Create new agents, skills, and rules.

- Generates agent scaffolding
- Validates structure and metadata
- Updates registries

### mgr-updater

**Role**: Update agents from external sources.

- Checks for updates
- Syncs with remote templates
- Manages versioning

### mgr-supplier

**Role**: Audit and verify dependencies.

- Validates skill references
- Checks for broken links
- Reports dependency issues

### mgr-gitnerd

**Role**: Git operations and workflow automation.

- Manages branches and commits
- Handles merge operations
- Automates git workflows

### mgr-sauron

**Role**: System-wide monitoring and oversight.

- Monitors agent activities
- Tracks resource usage
- Reports system health

### mgr-claude-code-bible

**Role**: Fetch official Claude Code documentation and verify compliance.

- Fetches latest docs from code.claude.com
- Verifies agents/skills frontmatter against the official spec

## System Agents

System agents provide core functionality.

### sys-memory-keeper

**Role**: Manage session memory and context.

- Saves session context
- Recalls relevant memories
- Handles context persistence

### sys-naggy

**Role**: Task reminders and TODO management.

- Tracks TODO items
- Sends reminders
- Manages task priorities

## SW Engineer Agents - Frontend

### fe-vercel-agent

**Role**: Vercel and Next.js development.

- React best practices
- Next.js patterns
- Vercel deployment

### fe-vuejs-agent

**Role**: Vue.js development.

- Vue 3 composition API
- Vuex/Pinia state management
- Vue ecosystem

### fe-svelte-agent

**Role**: Svelte development.

- Svelte components
- SvelteKit applications
- Svelte stores

## SW Engineer Agents - Backend

### be-fastapi-expert

**Role**: FastAPI development.

- Python async APIs
- Pydantic models
- FastAPI patterns

### be-springboot-expert

**Role**: Spring Boot development.

- Java/Kotlin Spring apps
- Spring ecosystem
- Enterprise patterns

### be-go-backend-expert

**Role**: Go backend development.

- Go web services
- Go concurrency
- Go ecosystem

### be-express-expert

**Role**: Express.js development.

- Node.js APIs
- Express middleware
- JavaScript backend

### be-nestjs-expert

**Role**: NestJS development.

- TypeScript backend
- NestJS modules
- Enterprise Node.js

## SW Engineer Agents - Language

### lang-golang-expert

**Role**: Go language expertise.

- Go idioms and patterns
- Go tooling
- Go best practices

### lang-python-expert

**Role**: Python language expertise.

- Python patterns
- Python tooling
- Python best practices

### lang-rust-expert

**Role**: Rust language expertise.

- Rust ownership model
- Rust patterns
- Rust ecosystem

### lang-kotlin-expert

**Role**: Kotlin language expertise.

- Kotlin idioms
- Kotlin/JVM
- Kotlin multiplatform

### lang-typescript-expert

**Role**: TypeScript language expertise.

- TypeScript patterns
- Type system
- TypeScript tooling

### lang-java-expert

**Role**: Java language expertise.

- Modern Java features
- Java patterns
- JVM ecosystem

## SW Engineer Agents - Tooling

### tool-npm-expert

**Role**: npm and package management.

- Package.json management
- npm scripts
- Dependency management

### tool-optimizer

**Role**: Performance optimization.

- Code optimization
- Build optimization
- Runtime performance

### tool-bun-expert

**Role**: Bun runtime expertise.

- Bun APIs
- Bun tooling
- Bun ecosystem

## SW Engineer Agents - Database

### db-supabase-expert

**Role**: Supabase backend and database.

- Supabase APIs
- PostgreSQL database
- Supabase auth and storage

## SW Architect Agents

### arch-documenter

**Role**: Documentation creation and maintenance.

- Technical writing
- API documentation
- Architecture docs

### arch-speckit-agent

**Role**: Specification and design documents.

- OpenAPI specs
- System design
- Technical specs

## Infra Engineer Agents

### infra-docker-expert

**Role**: Docker and containerization.

- Dockerfile optimization
- Docker Compose
- Container orchestration

### infra-aws-expert

**Role**: AWS cloud services.

- AWS architecture
- AWS services
- Cloud deployment

## QA Team Agents

### qa-planner

**Role**: Test planning and strategy.

- Test plans
- Coverage analysis
- Risk assessment

### qa-writer

**Role**: Test case creation.

- Test scenarios
- Test data
- Test documentation

### qa-engineer

**Role**: Test implementation and execution.

- Test automation
- Test frameworks
- Bug reporting

## Agent Structure

Each agent follows this structure:

```
.claude/agents/{agent-name}.md   # single file: YAML frontmatter + role/workflow body
```

Skills live in `.claude/skills/{name}/SKILL.md` and guides in `guides/`; agents reference them rather than embedding them (R006).

## Using Agents

Agents are automatically selected based on intent detection, or you can explicitly invoke them:

```
@lang-golang-expert review this code
@be-fastapi-expert create a new endpoint
@infra-docker-expert optimize the Dockerfile
```

See [Customization](/guide/customization) for creating your own agents.
