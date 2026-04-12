---
title: be-express-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/be-express-expert.md
related:
  - [[lang-typescript-expert]]
  - [[be-nestjs-expert]]
  - [[tool-npm-expert]]
---

# be-express-expert

Expert Express.js developer for production-ready Node.js APIs following security best practices and 12-factor app principles.

## Overview

`be-express-expert` builds scalable Express.js applications with a focus on security hardening and production readiness. Core competencies include modular router architecture, layered middleware chains (helmet, cors, rate limiting, custom error handler), centralized error handling with async/await propagation, 12-factor configuration, and security patterns (input validation, parameterized queries, secure cookies, HTTPS, CORS).

The agent references the official Express.js documentation and security guide directly.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: Express.js official docs (https://expressjs.com/)
- **Used by**: `dev-lead-routing` skill (Node.js backend task routing)
- **See also**: [[lang-typescript-expert]] (TypeScript for Node.js), [[be-nestjs-expert]] (opinionated Node.js alternative), [[tool-npm-expert]] (npm package management)

## Sources

- `.claude/agents/be-express-expert.md` — agent definition
