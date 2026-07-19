---
title: Vercel Deploy
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/vercel-deploy/SKILL.md
related:
  - [[fe-vercel-agent]]
  - [[react-best-practices]]
  - [[web-design-guidelines]]
  - [[impeccable-design]]
---

# Vercel Deploy

Deploys an application to Vercel with automatic framework detection and shareable preview URLs.

## Overview

`vercel-deploy` is a lightweight, framework-agnostic deployment skill: it auto-detects the project framework from `package.json` (40+ frameworks — Next.js, React, Vue, Nuxt, Svelte, Astro, and more), excludes `node_modules/`, `.git/`, and `.env` files from the upload bundle, then uploads and returns two URLs — a **Preview URL** (view the live deployment) and a **Claim URL** (transfer anonymous-deploy ownership to a Vercel account). The execution flow is a fixed 4-step pipeline: detect framework → prepare bundle → upload → return URLs. Unlike a full CI/CD deploy skill, it does not run pre-deploy build/test gates or manage environment variables/production promotion — those responsibilities stay with the invoking agent or an external Vercel account.

| Field | Value |
|---|---|
| Scope | core |
| User-invocable | yes |
| Requirements | valid project structure, `package.json` present, Vercel CLI or API token for authenticated deploys |
| Limitations | claimable deploys are anonymous; preview URLs are temporary; full features require a Vercel account |

## Relationships

- **Used by agents**: [[fe-vercel-agent]] — its `skills:` frontmatter lists `vercel-deploy` alongside [[react-best-practices]], [[web-design-guidelines]], and [[impeccable-design]] for React/Next.js optimization and deployment automation.
- **Origin**: external skill mirrored from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (v1.0.0); update via `npx add-skill vercel-labs/agent-skills`.

## Sources

- `.claude/skills/vercel-deploy/SKILL.md` — skill definition
