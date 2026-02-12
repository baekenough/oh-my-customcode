# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2026-02-12

### Added
- CI security audit workflow: weekly scheduled scan + PR trigger (Closes #86)
- Security audit job in CI pipeline (runs after lint and test)
- Pre-commit coverage enforcement with 95% threshold (Closes #84)
- Dependabot enhanced configuration: scoped commits, reviewer assignment, UTC scheduling
- Bilingual PR analyzer workflow: Claude API-powered PR analysis with EN/KO comments
- `--force-overwrite-all` CLI flag to bypass all file preservation mechanisms
- i18n translations (en/ko) for new CLI option

### Changed
- `noExcessiveCognitiveComplexity` biome rule elevated from `warn` to `error` (Closes #85)
- `parseEntryDoc()` refactored: cognitive complexity 22 → ≤15 via helper extraction
- `update()` refactored: cognitive complexity 16 → ≤15 via helper extraction
- Dependabot group renamed: `dev-dependencies` → `development-dependencies`
- Dependabot labels updated: added `automated` tag
- Reduce redundant `loadConfig()` calls: list module 4→1, updater module 6→1 (Closes #74)
- Clarify `preserveCustomizations` option semantics with JSDoc documentation (Closes #75)

### Fixed
- Entry-merger false positive on markers inside fenced code blocks (Closes #73)
- Pre-commit hook false positive: `grep "0 fail"` matching "10 fail" → `grep -qE '^ *0 fail'`
- CI: `bun pm audit` → `npm audit` (bun pm audit doesn't exist)
- CI: branch pattern `release` → `release/**` for proper matching
- Documentation: skill count 52 → 51 in README.md and README_ko.md
- Documentation: context count 1 → 4 in README.md and README_ko.md
- Documentation: agent category order alignment between EN/KO README files

## [0.9.4] - 2026-02-11

### Added
- `preserveFiles` config field: protect specific files/directories from being overwritten during `omcustom update` (Closes #69)
- CLAUDE.md merge mechanism: `<!-- omcustom:start -->` / `<!-- omcustom:end -->` markers separate template content from user customizations (Closes #70)
- Custom component tracking: `customComponents` config with `managed: false` flag for user-created agents, skills, rules, and guides (Closes #71)
- `omcustom doctor` checks custom component path existence
- `omcustom list` shows `[custom]` tag for unmanaged components
- Entry document merge: preserves user-written sections while updating template-managed sections

### Fixed
- ESM compatibility: replaced `require('node:path')` with module-level imports in `shouldSkipPath`, `getRelativePath`, `isAbsolutePath`
- `customComponents` deduplication now uses path-based comparison instead of broken `Set` reference equality

## [0.9.3] - 2026-02-10

### Added
- Pre-flight CLI version check: automatically checks for outdated CLI tools (claude-code, codex) via Homebrew before running commands (Closes #54)
  - Homebrew integration with npm/npx fallback
  - CI environment auto-detection (skips check in CI)
  - `--skip-version-check` global flag
- `omcustom update` command: update agents, skills, rules, guides, hooks, and contexts to latest version (Closes #52)
  - Component-selective updates (`--agents`, `--skills`, `--rules`, `--guides`, `--hooks`, `--contexts`)
  - Dry-run mode (`--dry-run`), backup support (`--backup`), force update (`--force`)
  - User customization preservation
  - Provider-aware updates (`--provider auto|claude|codex`)

## [0.9.2] - 2026-02-10

### Fixed
- Resolve release workflow conflict by using `workflow_run` trigger instead of duplicate `push: tags` trigger (#59)

## [0.9.1] - 2026-02-10

### Fixed
- Add missing `secretary-routing` skill to templates (Closes #57)

## [0.9.0] - 2026-02-10

### Added
- Dual-mode provider detection (Claude/Codex) with override/config/env/project markers
- Codex templates: `.codex/` tree, `AGENTS.md` templates, `manifest.codex.json`
- Provider export API for layout/detection utilities
- Codex native verification workflow (reusable GitHub Actions)
- Hook and context documentation in READMEs

### Changed
- CLI: `init`, `list`, `doctor` support `--provider` and auto-detection
- Installer/updater now resolve component paths by provider root (`.claude` or `.codex`)
- Config adds `provider` field (default `auto`)

### Fixed
- README agent names now use full filenames (e.g., `lang-golang-expert` not `lang-golang`)
- Routing skill names use exact directory names in documentation
- Orchestration skill count corrected (added qa-lead-routing)
- Code coverage improved to 99.28%

## [0.8.0] - 2026-02-10

### Added
- Data Engineering agent ecosystem: 8 DE agents (de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-iceberg-expert, de-pipeline-architect, de-quality-engineer)
- Database agents: db-postgres and db-redis
- DE lead routing skill for data engineering task delegation
- 8 best-practices skills: airflow, dbt, spark, kafka, snowflake, iceberg, postgres, redis
- 8 reference guides: airflow, dbt, spark, kafka, snowflake, iceberg, postgres, redis
- Pipeline architecture patterns skill

### Changed
- Agent count: 34 → 42
- Skill count: 41 → 51
- Guide count: 14 → 22
- Secretary routing updated with missing agents (mgr-claude-code-bible, sys-memory-keeper, sys-naggy)
- Dev-lead routing updated with missing agents (arch-documenter, arch-speckit-agent, infra-docker-expert, infra-aws-expert)

### Fixed
- README.md/README_ko.md counts updated to reflect new agents/skills/guides
- Hook count corrected (2 → 1) and context count corrected (1 → 4) in README.md
- 100% routing coverage achieved (42/42 agents routable)

## [0.7.0] - 2026-02-10

### Added
- `monitoring-setup` skill: OTel console monitoring enable/disable via `/monitoring-setup`
- Natural language triggers for monitoring activation (Korean/English)

### Changed
- CLAUDE.md.en: Added `/monitoring-setup` to slash commands table
- CLAUDE.md.ko: Added `/monitoring-setup` to slash commands table

### Dependencies
- Merged Dependabot PRs: upload-artifact v6, download-artifact v6, Anthropic SDK 0.74.0, nodemailer v8, @types/nodemailer v7
- Fixed 3 E2E test failures (locale-agnostic assertions)
- Added claude-native-check.yml workflow
- Fixed README_ko.md typo (qa-qa-engineer → qa-engineer)

## [0.6.2] - 2026-02-08

### Fixed
- Release Notes workflow: add fetch-tags: true to checkout to prevent missing tag references
- Release Notes script: wrap git commands in try/catch with fallback for robustness

## [0.6.1] - 2026-02-08

### Fixed
- Release Notes Generator: auto-detect previous tag on tag push events
- Release Notes Generator script: robust fallback using sorted tag list
- E2E symlink test timeout increased to 15s for CI environments

## [0.6.0] - 2026-02-08

### Added
- R018 (SHOULD-agent-teams.md): Agent Teams rule for active usage when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is enabled
- Agent Teams section in CLAUDE.md.en and CLAUDE.md.ko templates
- Decision matrix for Task Tool vs Agent Teams selection

### Changed
- R010: Replace experimental Agent Teams disclaimer with active integration guidance
- index.yaml: Add missing R016, R017 entries and new R018
- index.yaml: Fix R007, R008, R009 priority mismatches (SHOULD/MAY → MUST)
- Rule counts updated from 17 to 18 across all documentation
- manifest.json: Updated rule file count (18 → 19) and timestamp

## [0.5.0] - 2026-02-07

### Added
- Recreated `verify-sync.sh` for read-only template drift detection (replaces deleted version)

### Fixed
- Fix init empty directories bug: `createDirectoryStructure()` pre-created empty dirs causing `installComponent()` to skip file copying for agents, skills, guides, rules, hooks, contexts
- Fix `CLAUDE_SUBDIR_COMPONENTS` missing agents and skills entries in init.ts
- Fix Issue Analyzer workflow missing @anthropic-ai/sdk (Closes #35)
- Fix Release Notes Generator workflow missing @anthropic-ai/sdk (Closes #34)
- Fix sync-check CI workflow referencing deleted verify-sync.sh

### Removed
- Remove deprecated `pipelines` and `examples` directories and all references
- Remove `--production` flag from workflow bun install steps

## [0.4.0] - 2026-02-06

### Added
- Reusable workflow push-guards (prevent phantom CI failures on push)
- mgr-claude-code-bible agent to documentation and tables

### Changed
- Replace all hardcoded "baekgom-agents" references with generic names in templates
- Genericize template project names (my-project, AI Agent System)
- Update sourceRepo URLs to oh-my-customcode
- Fix slash command names to match actual skills (/audit-agents, /dev-review, /sauron-watch)
- Documentation validator uses fs.readdirSync instead of Bun Glob (CI compatibility)

### Removed
- Custom Pipelines section from READMEs (feature was removed)
- Pipeline references from project structure and commands
- sync.sh, sync.sh.example, verify-sync.sh (unused sync scripts)
- tutor-go agent references (agent doesn't exist)

### Fixed
- Rule counts: 18 → 17 (MUST 11, SHOULD 5, MAY 1)
- Agent name typos in README_ko (db-expert → db-supabase-expert, qa-qa-* → qa-*)
- Manager agent count: 6 → 7 (added mgr-claude-code-bible)
- R010 orchestrator coordination rule: all file modifications must be delegated

## [0.3.2] - 2026-02-05

### Changed
- Sync templates from source (36 files updated)
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

[Unreleased]: https://github.com/baekenough/oh-my-customcode/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.4...v0.10.0
[0.9.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.2...v0.4.0
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
