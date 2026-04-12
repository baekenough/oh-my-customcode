---
title: "Go Backend Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/go-backend/project-layout.md
related:
  - [[be-go-backend-expert]]
  - [[go-backend-best-practices]]
---

# Go Backend Guide

Reference documentation for Go backend service architecture, standard project layout, and HTTP server patterns.

## Overview

Covers the standard Go project layout (`cmd/`, `internal/`, `pkg/`, `api/`) and backend-specific patterns including HTTP handler design, middleware, repository pattern, configuration management, and graceful shutdown. Based on the golang-standards/project-layout convention and Uber Go Style Guide. Used by `be-go-backend-expert` for Go API and service development.

## Key Topics

- Standard project layout: `cmd/`, `internal/`, `pkg/`, `api/`, `configs/`
- Handler → Service → Repository layered architecture
- HTTP server setup with `net/http` or Chi/Gin/Echo
- Middleware patterns (auth, logging, recovery)
- Configuration loading and environment variable binding
- Graceful shutdown and signal handling
- Error wrapping and structured logging with `slog`

## Relationships

- **Used by agents**: [[be-go-backend-expert]]
- **Related skills**: [[go-backend-best-practices]]
- **See also**: [[golang]], [[postgres]], [[redis]], [[docker]]

## Sources

- `guides/go-backend/project-layout.md` — directory structure, layer descriptions, main.go patterns
