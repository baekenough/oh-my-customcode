---
title: tool-bun-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/tool-bun-expert.md
related:
  - [[tool-npm-expert]]
  - [[lang-typescript-expert]]
  - [[fe-vercel-agent]]
---

# tool-bun-expert

Expert Bun runtime developer for high-performance JavaScript/TypeScript applications, covering bunfig.toml configuration, Bun test runner, fast bundling, and Node.js-to-Bun migrations.

## Overview

`tool-bun-expert` specializes in Bun — the fast all-in-one JavaScript runtime, bundler, test runner, and package manager. Key capabilities: writing code optimized for Bun's native TypeScript/JSX support and fast startup, configuring bunfig.toml, using Bun's Jest-compatible test runner, leveraging fast bundling with tree-shaking and code splitting, migrating Node.js projects to Bun, managing workspaces/monorepos, and using Bun-specific APIs (Bun.file, Bun.serve, built-in SQLite).

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Bash
- **Memory**: project
- **Effort**: medium

## Relationships

- **Depends on**: Bun runtime documentation
- **Used by**: `dev-lead-routing` skill (Bun/JS tooling task routing)
- **See also**: [[tool-npm-expert]] (npm alternative/complement), [[lang-typescript-expert]] (TypeScript language), [[fe-vercel-agent]] (frontend bundling)

## Sources

- `.claude/agents/tool-bun-expert.md` — agent definition
