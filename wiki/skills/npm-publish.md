---
title: NPM Publish
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/npm-publish/SKILL.md
related:
  - [[tool-npm-expert]]
  - [[npm-version]]
  - [[npm-audit]]
---

# NPM Publish

Deploy packages to the npm registry with pre-publish checks.

## Overview

Automates npm package publishing: pre-publish checks (audit, tests, build), version bump confirmation, registry authentication, `npm publish` execution, and post-publish verification. Supports dry-run mode. Enforces that audit passes before publish. Delegates all file modifications (package.json version update) to `tool-npm-expert`.

## Key Details

- **Scope**: package
- **User-invocable**: yes
- **Command**: `/omcustom:npm-publish`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-npm-expert]]
- **Related skills**: [[npm-version]], [[npm-audit]]
- **See also**: [[R001]]

## Sources

- `.claude/skills/npm-publish/SKILL.md` — skill definition
