---
title: tool-npm-expert
type: agent
updated: 2026-11-23
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

The agent declares no `skills:` frontmatter. The related skills [[skills/npm-audit|npm-audit]], [[skills/npm-publish|npm-publish]], and [[skills/npm-version|npm-version]] are `scope: package` and are not deployed by `omcustom init`. Works closely with [[mgr-gitnerd]] for version commits/tags.

## Key Details

- **Model**: claude-sonnet-5-5
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Bash
- **Memory**: local (`.claude/agent-memory-local/tool-npm-expert/`, git-untracked)
- **Effort**: medium

## Relationships

- **Depends on**: none declared (no `skills:` frontmatter; the three `scope: package` npm skills above exist separately)
- **Used by**: no routing or skill reference observed in the source; the source lists integration with [[mgr-gitnerd]] (version commits/tags), [[lang-typescript-expert]] (TS builds) and qa-lead (test validation)
- **See also**: [[mgr-gitnerd]] (version commits/tags), [[lang-typescript-expert]] (TS builds before publish), qa-lead (test validation before publish), [[tool-bun-expert]] (Bun alternative), [[tool-optimizer]] (bundle analysis)

## Sources

- `.claude/agents/tool-npm-expert.md` — agent definition
