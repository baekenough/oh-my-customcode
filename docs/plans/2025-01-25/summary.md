# Summary

## Project Info

| Item | Value |
|------|-------|
| Name | oh-my-customcode |
| Description | Batteries-included agent harness for Claude Code |
| License | MIT |
| Repository | github.com/baekenough/oh-my-customcode |
| npm Package | oh-my-customcode |
| CLI Command | omcc |

## Tech Stack

| Area | Technology |
|------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Linter/Formatter | Biome (Rust-based) |
| Test | Bun test |
| i18n | i18next |
| CLI | Commander.js |

## Git Strategy

| Branch | Role |
|--------|------|
| release | Default, production |
| develop | Development integration |
| feat/* | Feature development |

## Version Strategy

All development + 100% test complete → v0.1.0 release

## Prerequisites (baekgom-agents) - ✅ COMPLETED

| Agent | Location |
|-------|----------|
| npm-expert | sw-engineer/tooling |
| optimizer | sw-engineer/tooling |
| bun-expert | sw-engineer/tooling |
| sauron | manager |

## Responsible Agents (oh-my-customcode Development)

| Role | Agent |
|------|-------|
| Orchestration | dev-lead, qa-lead, secretary |
| Implementation | typescript-expert, bun-expert |
| Testing | qa-planner, qa-writer, qa-engineer |
| Documentation | documenter, speckit-agent |
| Optimization | optimizer |
| Deployment | npm-expert, gitnerd |

## Core Principles

- Test coverage **100%** required (including deploy tests)
- Speckit spec documents required
- All work orchestrated by appropriate orchestrator
- i18n default English, Korean supported
- Rust-based tooling (Biome) for code quality

## Test Levels

| Level | Scope | Environment |
|-------|-------|-------------|
| Unit | Function/module | Local + CI |
| Integration | Module integration | Local + CI |
| E2E | Full CLI flow | Local + CI |
| Deploy | npm publish + install | CI only |

## GitHub Features

| Feature | Usage |
|---------|-------|
| Projects | Kanban board, Roadmap, Sprint tracking |
| Issues | Bug reports, Feature requests, Documentation |
| Actions | CI, Deploy test, Release, Docs deployment |
| Release | Auto-generated notes, npm publish trigger |
| Pages | VitePress documentation site |
| PR | Template with 100% coverage requirement |

## gitnerd Automation

| Command | GitHub Action |
|---------|---------------|
| `git:pr` | Create PR with template |
| `git:release` | Tag + trigger release workflow |
| `git:issue` | Create issue from template |
| `git:project` | Update project board |

## Documents in This Plan

1. [Overview](./overview.md) - Project overview and core values
2. [Architecture](./architecture.md) - Project structure
3. [CLI Design](./cli-design.md) - CLI command design
4. [Agent System](./agent-system.md) - Agent system design
5. [Testing Strategy](./testing-strategy.md) - Testing including deploy tests
6. [i18n Design](./i18n-design.md) - Internationalization
7. [Git Strategy](./git-strategy.md) - Git workflow
8. [Package Config](./package-config.md) - Package and deployment
9. [Prerequisites](./prerequisites.md) - baekgom-agents updates (COMPLETED)
10. [GitHub Features](./github-features.md) - GitHub integration design
11. [Summary](./summary.md) - This document

---

**Status**: Approved
**Date**: 2025-01-25
