---
title: Go Backend Best Practices
type: skill
updated: 2026-11-09
sources:
  - .claude/skills/go-backend-best-practices/SKILL.md
related:
  - [[be-go-backend-expert]]
  - [[go-best-practices]]
---

# Go Backend Best Practices

Go backend patterns from Uber style guide for production-grade services.

## Overview

Reference patterns for Go backend services: HTTP handler structure, middleware patterns, error wrapping and propagation, structured logging (zap/slog), context propagation, graceful shutdown, connection pooling, rate limiting, and service-layer organization. The testing section recommends table-driven tests, interfaces for mocking, and `go.uber.org/mock (mockgen)` for mocks (the older `golang/mock` is archived), with `cmp.Diff` for assertions. Extends `go-best-practices` with backend-specific patterns. Used by `be-go-backend-expert`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[be-go-backend-expert]]
- **Related skills**: [[go-best-practices]], [[docker-best-practices]], [[postgres-best-practices]]
- **See also**: guides/go-backend-best-practices/

## Sources

- `.claude/skills/go-backend-best-practices/SKILL.md` — skill definition
