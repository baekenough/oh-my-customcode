---
title: be-go-backend-expert
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/be-go-backend-expert.md
related:
  - [[lang-golang-expert]]
  - [[infra-docker-expert]]
  - [[dev-lead-routing]]
  - [[go-backend-best-practices]]
  - [[be-django-expert]]
---

# be-go-backend-expert

Expert Go backend developer for production-ready services following the Uber style guide and standard project layout, covering HTTP/gRPC servers, microservices, and concurrent systems.

## Overview

`be-go-backend-expert` focuses specifically on Go backend services — HTTP/gRPC server implementation, microservice architecture, and concurrent system design. It applies Uber Go style guide conventions and structures projects using the standard Go project layout (`cmd/`, `internal/`, `pkg/`). It is the backend-specialist complement to [[lang-golang-expert]], which handles general Go language patterns rather than backend-service architecture specifically.

The agent uses the [[go-backend-best-practices]] skill and consults the [go-backend guide](../guides/go-backend.md) for backend-specific reference, following R006's separation of concerns (agent = WHAT, skill = HOW, guide = reference).

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: [[go-backend-best-practices]]
- **Memory**: local (`.claude/agent-memory-local/be-go-backend-expert/`, git-untracked) — changed from `project` in #1468 (v1.1.13)
- **Effort**: high
- **Permission mode**: `bypassPermissions` (added #719, tier-based adoption across all agents)

## Relationships

- **Depends on**: [[go-backend-best-practices]] skill, [go-backend guide](../guides/go-backend.md)
- **Used by**: [[dev-lead-routing]] skill (Go backend task routing, alongside `be-fastapi-expert`, `be-springboot-expert`, `be-nestjs-expert`, `be-express-expert`, [[be-django-expert]])
- **See also**: [[lang-golang-expert]] (general Go language), [[infra-docker-expert]] (containerization)

## Sources

- `.claude/agents/be-go-backend-expert.md` — agent definition
