---
title: Vercel Deploy
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/vercel-deploy/SKILL.md
related:
  - [[fe-vercel-agent]]
  - [[react-best-practices]]
  - [[typescript-best-practices]]
---

# Vercel Deploy

Deploy applications to Vercel with environment configuration and preview URLs.

## Overview

Automates Vercel deployments: pre-deploy checks (build passes, tests pass), `vercel deploy` execution, environment variable management, preview URL generation, and production promotion. Supports `--preview` (preview deployment) and `--prod` (production deployment) modes. Handles environment-specific config via Vercel CLI. Delegates git operations to `mgr-gitnerd` and file edits to `fe-vercel-agent`.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/vercel-deploy`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[fe-vercel-agent]]
- **Related skills**: [[react-best-practices]], [[typescript-best-practices]]
- **See also**: [[mgr-gitnerd]], [[R001]]

## Sources

- `.claude/skills/vercel-deploy/SKILL.md` — skill definition
