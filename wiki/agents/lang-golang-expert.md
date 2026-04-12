---
title: lang-golang-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/lang-golang-expert.md
related:
  - [[be-go-backend-expert]]
  - [[lang-python-expert]]
  - [[lang-rust-expert]]
  - [[lang-typescript-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java21-expert]]
---

# lang-golang-expert

Expert Go developer for writing idiomatic, performant Go code following Effective Go guidelines, with specializations in concurrent systems, error handling patterns, and standard project layout.

## Overview

`lang-golang-expert` is the primary agent for Go language work — writing idiomatic code following Effective Go, reviewing/refactoring existing code, designing concurrent systems with goroutines and channels, implementing proper error handling, and structuring projects with the standard Go layout. It has a `soul: true` identity layer for consistent personality.

Pairs naturally with [[be-go-backend-expert]] for backend service concerns beyond the language itself. Uses `go-best-practices` skill and `guides/golang/`.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `go-best-practices`
- **Memory**: project
- **Effort**: high
- **Soul**: enabled (identity layer active)

## Relationships

- **Depends on**: `go-best-practices` skill, `guides/golang/`
- **Used by**: `dev-lead-routing` skill (Go language task routing), R010 delegation table ("Go code")
- **See also**: [[be-go-backend-expert]] (Go backend services), [[lang-rust-expert]] (systems programming alternative), [[lang-python-expert]], [[lang-typescript-expert]], [[lang-kotlin-expert]], [[lang-java21-expert]]

## Sources

- `.claude/agents/lang-golang-expert.md` — agent definition
