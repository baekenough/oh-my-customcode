---
title: be-go-backend-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/be-go-backend-expert.md
related:
  - [[lang-golang-expert]]
  - [[infra-docker-expert]]
---

# be-go-backend-expert

Expert Go backend developer for production-ready services following the Uber style guide and standard project layout, covering HTTP/gRPC servers, microservices, and concurrent systems.

## Overview

`be-go-backend-expert` focuses specifically on Go backend services — HTTP/gRPC server implementation, microservice architecture, and concurrent system design. It applies Uber Go style guide conventions and structures projects using the standard Go project layout (`cmd/`, `internal/`, `pkg/`). It is the backend-specialist complement to [[lang-golang-expert]], which handles general Go language patterns.

The agent uses the `go-backend-best-practices` skill and consults `guides/go-backend/` for backend-specific reference.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `go-backend-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `go-backend-best-practices` skill, `guides/go-backend/`
- **Used by**: `dev-lead-routing` skill (Go backend task routing)
- **See also**: [[lang-golang-expert]] (general Go language), [[infra-docker-expert]] (containerization)

## Sources

- `.claude/agents/be-go-backend-expert.md` — agent definition
