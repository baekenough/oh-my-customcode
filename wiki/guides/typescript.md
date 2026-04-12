---
title: "TypeScript Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/typescript/advanced-types.md
related:
  - [[lang-typescript-expert]]
  - [[typescript-best-practices]]
---

# TypeScript Guide

Reference documentation for type-safe TypeScript patterns, advanced types, and modern JavaScript best practices.

## Overview

Covers TypeScript's advanced type system (utility types, mapped types, conditional types, template literal types), strict mode configuration, module resolution, generic patterns, and integration with React/Next.js. Based on the TypeScript Handbook and community best practices. Used by `lang-typescript-expert` and `fe-vercel-agent` for TypeScript/JavaScript projects.

## Key Topics

- Utility types: `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `ReturnType`
- Mapped types and key remapping with `as` clause
- Conditional types and `infer` keyword
- Template literal types for string manipulation
- Discriminated unions and exhaustive checking
- Generic constraints and variance
- `strict` mode: `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`

## Relationships

- **Used by agents**: [[lang-typescript-expert]], [[fe-vercel-agent]]
- **Related skills**: [[typescript-best-practices]]
- **See also**: [[drizzle-orm]], [[react-best-practices]], [[golang]]

## Sources

- `guides/typescript/advanced-types.md` — utility types, mapped types, conditional types
