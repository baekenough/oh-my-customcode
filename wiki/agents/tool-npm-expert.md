---
title: tool-npm-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/tool-npm-expert.md
related:
  - [[lang-typescript-expert]]
  - [[mgr-gitnerd]]
  - [[tool-bun-expert]]
  - [[tool-optimizer]]
---

# tool-npm-expert

npm package publishing, semantic versioning, package.json optimization, and dependency audit specialist for npm registry operations.

## Overview

`tool-npm-expert` handles the full npm package lifecycle: publishing (validate → lint → test → pack → publish → verify), semantic versioning with CHANGELOG.md updates and git tags, and dependency auditing (npm audit, vulnerability analysis, outdated checks). It operates in three modes: Publish, Version, and Audit.

Uses three focused skills: `npm-audit`, `npm-publish`, and `npm-version`. Works closely with [[mgr-gitnerd]] for version commits/tags.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Bash
- **Skills**: `npm-audit`, `npm-publish`, `npm-version`
- **Memory**: project
- **Effort**: medium

## Relationships

- **Depends on**: `npm-audit` skill, `npm-publish` skill, `npm-version` skill
- **Used by**: `/omcustom:npm-publish`, `/omcustom:npm-version`, `/omcustom:npm-audit` commands, [[lang-typescript-expert]] integration
- **See also**: [[mgr-gitnerd]] (version commits/tags), [[lang-typescript-expert]] (TS builds before publish), [[tool-bun-expert]] (Bun alternative), [[tool-optimizer]] (bundle analysis)

## Sources

- `.claude/agents/tool-npm-expert.md` — agent definition
