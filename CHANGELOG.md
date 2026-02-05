# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.2] - 2026-02-05

### Changed
- Sync templates from baekgom-agents (36 files updated)
- Release workflow requires CHANGELOG.md entry (fails if missing)
- Branch protection rules simplified to Lint + Test only

### Fixed
- CI: Skip duplicate npm publish if version already exists

## [0.3.1] - 2026-02-05

### Fixed
- Increase e2e test timeout from 10s to 30s to prevent CI timeouts

## [0.3.0] - 2026-02-05

### Added
- Claude API automation workflows (#17)
  - Issue analyzer workflow (Claude-powered)
  - Documentation validator workflow
  - Release notes generator workflow
- Language toggle links in READMEs (English ↔ Korean)

### Changed
- Sync-check runs daily at 04:00 KST with private repo access
- CI simplified to macOS only with consolidated coverage checks
- Clarified release branch publishing workflow in CONTRIBUTING.md
- Release workflow skips publish if version already exists

### Removed
- CodeRabbit integration (too heavy for this project)

## [0.2.1] - 2026-01-28

### Fixed
- Bug fixes and stability improvements

## [0.2.0] - 2026-01-28

### Added
- Official Claude Code format support (flat agent structure)
- Updated agent count to 34
- Updated skill count to 42
- Updated guide count to 13

### Changed
- Migrated from nested to flat agent directory structure
- Updated templates to match baekgom-agents official format

## [0.1.4] - 2026-01-27

### Added

- Sync automation script (`scripts/sync-core.ts`) for baekgom-agents template synchronization
- Sub-agent model specification support in rules (R008, R009, R010)
- `[agent][model] → Tool` identification format in MUST-tool-identification
- New guide: `guides/claude-code/11-sub-agents.md`

### Changed

- Disable Windows CI test matrix for Bun stability
- Update orchestrator rules with model parameter documentation
- Update secretary and dev-lead agent definitions

### Removed

- Remove tech-reviewer agent, guide, and skill (consolidated into baekgom-agents source)
- Remove Windows-incompatible E2E and mock tests

## [0.1.3] - 2026-01-26

### Changed

- **BREAKING**: Rename CLI command from `omcc` to `omcustom`
- Update templates from baekgom-agents (37 agents, 17 skills, 12 guides)
- Add sub-agent model specification support in templates
- Improve test coverage to 99.87% (100% function coverage)
- Adjust CI coverage threshold to 99.5% for Bun V8 compatibility

### Fixed

- Remove unreachable defensive code in doctor.ts
- Fix error handling tests for installer, list, and doctor modules

## [0.1.2] - 2026-01-25

### Added

- GitHub Packages publishing (`@baekenough/oh-my-customcode`)
- Automated release notes from CHANGELOG

### Changed

- Release workflow now publishes to both npm and GitHub Packages

## [0.1.1] - 2026-01-25

### Changed

- Bump `i18next` from 24.2.3 to 25.8.0
- Bump `commander` from 12.1.0 to 14.0.2
- Bump `@biomejs/biome` from 1.9.4 to 2.3.12
- Bump `actions/checkout` from v4 to v6
- Bump `actions/setup-node` from v4 to v6
- Migrate biome.json to v2 schema

### Fixed

- Fix biome lint configuration for v2 compatibility
- Fix unused variable warnings in source files

## [0.1.0] - 2026-01-25

### Added

- **CLI Tool (`omcustom`)** - Command-line interface for managing Claude Code agent systems
  - `omcustom init` - Initialize agent system in current project
  - `omcustom init --lang ko` - Initialize with Korean language support
  - `omcustom init --backup` - Backup existing installation before init
  - `omcustom update` - Update to latest agents and skills
  - `omcustom list` - List all installed components (agents, skills, guides, rules)
  - `omcustom list --format json` - JSON output format support
  - `omcustom doctor` - Verify installation health
  - `omcustom doctor --fix` - Auto-fix common issues

- **Pre-built Agents (36 total)**
  - Orchestrator agents: planner (master), secretary, dev-lead, qa-lead
  - Manager agents: creator, updater, supplier, gitnerd, sync-checker, sauron
  - System agents: memory-keeper, naggy
  - SW Engineer/Frontend: vercel-agent, vuejs-agent, svelte-agent
  - SW Engineer/Backend: fastapi, springboot, go-backend, express, nestjs
  - SW Engineer/Language: golang, python, rust, kotlin, typescript, java21
  - SW Engineer/Tooling: npm-expert, optimizer, bun-expert
  - SW Architect: documenter, speckit-agent
  - Infra Engineer: docker-expert, aws-expert
  - QA Team: qa-planner, qa-writer, qa-engineer

- **Skills (17 total)**
  - Development best practices for Go, Python, TypeScript, Kotlin, Rust, Java
  - Backend framework skills for FastAPI, Spring Boot, Express, NestJS
  - Infrastructure skills for Docker, AWS
  - System skills for memory management, result aggregation
  - Orchestration skills for pipeline execution, intent detection

- **Guides (12 total)**
  - Reference documentation for various technologies
  - Claude Code usage guides

- **Rules (18 total)**
  - MUST rules: Safety, permissions, agent design, identification (enforced)
  - SHOULD rules: Interaction, error handling, memory integration (recommended)
  - MAY rules: Optimization guidelines (optional)

- **Multi-language Support**
  - English (default)
  - Korean (`--lang ko`)

- **Internationalization (i18n)**
  - Full i18next integration
  - Easily extensible for additional languages

- **Template System**
  - Pre-configured templates for agents, skills, guides, and rules
  - Easy customization and extension

### Changed

- Nothing yet (initial release)

### Fixed

- Nothing yet (initial release)

[Unreleased]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/baekenough/oh-my-customcode/releases/tag/v0.1.0
