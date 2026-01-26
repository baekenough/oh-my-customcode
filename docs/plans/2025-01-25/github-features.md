# GitHub Features Design

## Overview

oh-my-customcode leverages GitHub's full feature set for project management, CI/CD, documentation, and release automation. All GitHub operations are orchestrated by **gitnerd** agent.

## GitHub Projects

### Project Board Structure

```
oh-my-customcode (Project)
├── Backlog          # Prioritized feature requests
├── Ready            # Ready for development
├── In Progress      # Currently being worked on
├── Review           # In PR review
├── QA               # QA verification
└── Done             # Completed
```

### Views

| View | Type | Purpose |
|------|------|---------|
| Kanban | Board | Sprint workflow |
| Roadmap | Roadmap | Release planning |
| My Tasks | Table | Personal task tracking |

### Automation Rules

```yaml
automations:
  - trigger: Issue opened
    action: Add to "Backlog"

  - trigger: PR opened
    action: Move linked issue to "In Progress"

  - trigger: PR approved
    action: Move linked issue to "QA"

  - trigger: PR merged to develop
    action: Move linked issue to "Done"

  - trigger: PR merged to release
    action: Create release draft
```

## GitHub Issues

### Issue Templates

```
.github/ISSUE_TEMPLATE/
├── bug_report.yml       # Bug reports
├── feature_request.yml  # Feature requests
├── documentation.yml    # Documentation updates
└── config.yml           # Template chooser config
```

### Bug Report Template

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Report a bug in oh-my-customcode
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting a bug!

  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: Clear description of the bug
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: Steps to reproduce the behavior
      placeholder: |
        1. Run `omcustom init`
        2. ...
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What you expected to happen

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happened

  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - macOS
        - Linux
        - Windows
    validations:
      required: true

  - type: input
    id: version
    attributes:
      label: Version
      placeholder: "0.1.0"
    validations:
      required: true
```

### Feature Request Template

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request
description: Suggest a new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem Statement
      description: What problem does this solve?
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: How should this be implemented?
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: What alternatives have you considered?

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - Low
        - Medium
        - High
        - Critical
```

### Label System

| Category | Labels | Color |
|----------|--------|-------|
| Type | `bug`, `enhancement`, `documentation`, `question` | Red, Green, Blue, Purple |
| Priority | `P0-critical`, `P1-high`, `P2-medium`, `P3-low` | Dark Red → Light Red |
| Status | `triage`, `confirmed`, `wontfix`, `duplicate` | Yellow, Green, Gray, Gray |
| Area | `cli`, `core`, `i18n`, `tests`, `ci` | Cyan variants |
| Effort | `effort:small`, `effort:medium`, `effort:large` | Orange variants |

## GitHub Pull Requests

### PR Template

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->
## Summary

<!-- Brief description of changes -->

## Changes

<!-- List main changes -->

-

## Related Issues

<!-- Link related issues -->

Closes #

## Spec Impact

- [ ] No spec changes
- [ ] Spec changes: `<!-- filename -->`

## Test Coverage

<!-- Test coverage report -->

| Type | Coverage |
|------|----------|
| Unit | __% |
| Integration | __% |
| E2E | __% |
| **Total** | **__% (must be 100%)** |

## Checklist

- [ ] Code follows project style guide (Biome)
- [ ] Self-review completed
- [ ] Documentation updated (if needed)
- [ ] No new warnings generated
- [ ] All tests pass locally
- [ ] Coverage is 100%
- [ ] i18n strings added for both EN/KO (if applicable)

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->
```

### Branch Protection Rules

| Branch | Rules |
|--------|-------|
| release | Require PR, 1+ review, all checks pass, no force push |
| develop | Require PR, 1+ review, all checks pass, no force push |

### Required Status Checks

```yaml
required_checks:
  - ci / unit-tests
  - ci / integration-tests
  - ci / e2e-tests
  - ci / coverage (100%)
  - ci / lint (Biome)
```

## GitHub Actions

### Workflow Overview

```
.github/workflows/
├── ci.yml              # PR tests (unit, integration, e2e, lint)
├── deploy-test.yml     # Deploy test (verdaccio)
├── release.yml         # npm publish on tag
├── coverage.yml        # Coverage report to PR
├── docs.yml            # GitHub Pages deployment
└── label-sync.yml      # Sync labels from config
```

### CI Workflow (ci.yml)

```yaml
name: CI

on:
  pull_request:
    branches: [develop, release]
  push:
    branches: [develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:coverage
      - name: Check 100% coverage
        run: |
          COVERAGE=$(bun run coverage:report | grep "All files" | awk '{print $NF}')
          if [ "$COVERAGE" != "100" ]; then
            echo "Coverage is $COVERAGE%, must be 100%"
            exit 1
          fi
```

### Release Workflow (release.yml)

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - run: bun install
      - run: bun run build
      - run: bun test

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          files: |
            dist/*
```

### Docs Workflow (docs.yml)

```yaml
name: Deploy Docs

on:
  push:
    branches: [release]
    paths:
      - 'docs/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - run: bun install
      - run: bun run docs:build

      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist
      - uses: actions/deploy-pages@v4
```

## GitHub Releases

### Release Process

```
1. develop → release PR created
2. All tests pass (100% coverage)
3. PR approved and merged
4. Tag created: git tag v0.1.0
5. Tag pushed: git push origin v0.1.0
6. GitHub Actions triggered:
   - npm publish
   - GitHub Release created
   - Release notes auto-generated
```

### Release Notes Template

```markdown
## What's New in v0.1.0

### Features
- feat: Add init command for project setup
- feat: Add update command for agent updates

### Bug Fixes
- fix: Resolve path issues on Windows

### Documentation
- docs: Add Korean README

**Full Changelog**: https://github.com/baekenough/oh-my-customcode/compare/v0.0.0...v0.1.0
```

## GitHub Pages

### Documentation Site

| Section | Content |
|---------|---------|
| Home | Project overview, quick start |
| Guide | Installation, configuration, usage |
| CLI Reference | Command documentation |
| Agent Reference | Available agents list |
| API Reference | TypeScript API docs |
| Contributing | How to contribute |

### Tech Stack

```yaml
docs_framework: VitePress
language: English (primary), Korean (translated)
hosting: GitHub Pages
domain: baekenough.github.io/oh-my-customcode
```

### Structure

```
docs/
├── .vitepress/
│   └── config.ts       # VitePress config
├── index.md            # Home
├── guide/
│   ├── installation.md
│   ├── configuration.md
│   └── usage.md
├── cli/
│   ├── init.md
│   ├── update.md
│   ├── list.md
│   └── doctor.md
├── agents/
│   └── index.md        # Agent reference
├── api/
│   └── index.md        # API docs (TypeDoc)
└── ko/                 # Korean translations
    ├── index.md
    └── guide/
        └── ...
```

## gitnerd Integration

### Automated Operations

| Command | GitHub Feature |
|---------|----------------|
| `git:pr` | Create PR with template |
| `git:release` | Create tag + trigger release |
| `git:issue` | Create issue from template |
| `git:project` | Update project board |
| `git:label` | Manage labels |

### gitnerd Workflow

```
User: "PR 만들어줘"

gitnerd:
  1. Check current branch
  2. Push to remote
  3. Create PR with template
  4. Add labels based on branch prefix
  5. Link to project board
  6. Request reviewers
  7. Report PR URL to user
```

## Configuration Files Summary

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml
│   ├── feature_request.yml
│   ├── documentation.yml
│   └── config.yml
├── PULL_REQUEST_TEMPLATE.md
├── workflows/
│   ├── ci.yml
│   ├── deploy-test.yml
│   ├── release.yml
│   ├── coverage.yml
│   ├── docs.yml
│   └── label-sync.yml
├── labels.yml              # Label definitions
├── CODEOWNERS              # Code owners
├── FUNDING.yml             # Sponsorship (optional)
└── dependabot.yml          # Dependency updates
```
