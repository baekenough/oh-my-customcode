---
title: lang-typescript-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/lang-typescript-expert.md
related:
  - [[fe-vercel-agent]]
  - [[be-nestjs-expert]]
  - [[be-express-expert]]
  - [[tool-npm-expert]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java-expert]]
  - [[lang-rust-expert]]
---

# lang-typescript-expert

Expert TypeScript developer for writing type-safe, maintainable, scalable code with advanced type features — generics, conditional types, mapped types — and Node.js/browser patterns.

## Overview

`lang-typescript-expert` handles TypeScript language work across all contexts: frontend (React, Vue), backend (Node.js, NestJS, Express), and cross-platform. Core expertise includes robust type system design, advanced TypeScript features (generics, conditional types, mapped types, template literal types), proper error handling patterns (discriminated unions), and optimization for both DX and runtime performance. Also handles JavaScript-to-TypeScript migrations.

Uses `typescript-best-practices` skill and `guides/typescript/`.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `typescript-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `typescript-best-practices` skill, `guides/typescript/`
- **Used by**: `dev-lead-routing` skill (TypeScript task routing), R010 delegation table ("TypeScript/Next.js"), [[tool-npm-expert]] (TS builds)
- **See also**: [[fe-vercel-agent]] (React/Next.js), [[be-nestjs-expert]] (NestJS), [[be-express-expert]] (Express), [[tool-npm-expert]] (publishing), [[lang-golang-expert]], [[lang-python-expert]], [[lang-kotlin-expert]], [[lang-java-expert]], [[lang-rust-expert]]

## Sources

- `.claude/agents/lang-typescript-expert.md` — agent definition
