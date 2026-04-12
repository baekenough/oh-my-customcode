---
title: fe-vercel-agent
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/fe-vercel-agent.md
related:
  - [[lang-typescript-expert]]
  - [[fe-design-expert]]
  - [[fe-vuejs-agent]]
  - [[fe-svelte-agent]]
  - [[tool-optimizer]]
  - [[db-supabase-expert]]
---

# fe-vercel-agent

Frontend specialist for React/Next.js optimization, web design review (accessibility, UX), and Vercel deployment automation.

## Overview

`fe-vercel-agent` is an external agent derived from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (v1.0.0). It covers React/Next.js optimization (40+ rules), web design review with 100+ accessibility and UX/UI rules (ARIA, dark mode, i18n), and automated Vercel deployment with auto-detection for 40+ frameworks.

The agent combines three specialized skills: `react-best-practices`, `web-design-guidelines`, and `vercel-deploy`, making it the all-in-one frontend deployment agent.

## Key Details

- **Model**: sonnet
- **Domain**: frontend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `react-best-practices`, `web-design-guidelines`, `vercel-deploy`, `impeccable-design`
- **Memory**: project
- **Effort**: medium
- **Source**: external from https://github.com/vercel-labs/agent-skills (v1.0.0)

## Relationships

- **Depends on**: `react-best-practices` skill, `web-design-guidelines` skill, `vercel-deploy` skill, `impeccable-design` skill
- **Used by**: `dev-lead-routing` skill (React/Next.js/Vercel task routing), R010 delegation table
- **See also**: [[lang-typescript-expert]] (TypeScript), [[fe-design-expert]] (aesthetic quality), [[tool-optimizer]] (bundle size), [[db-supabase-expert]] (Supabase backend)

## Sources

- `.claude/agents/fe-vercel-agent.md` — agent definition
