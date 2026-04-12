---
title: NPM Version
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/npm-version/SKILL.md
related:
  - [[tool-npm-expert]]
  - [[npm-publish]]
  - [[omcustom-release-notes]]
---

# NPM Version

Semantic version management for npm packages.

## Overview

Manages semantic versioning for npm packages: bumps patch/minor/major versions in `package.json`, generates a changelog entry, creates a git tag, and optionally triggers the publish workflow. Validates semver format, checks for uncommitted changes before version bump, and delegates git operations to `mgr-gitnerd`.

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/omcustom:npm-version`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-npm-expert]]
- **Related skills**: [[npm-publish]], [[omcustom-release-notes]]
- **See also**: [[mgr-gitnerd]], [[R017]]

## Sources

- `.claude/skills/npm-version/SKILL.md` — skill definition
