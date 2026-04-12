---
title: infra-docker-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/infra-docker-expert.md
related:
  - [[infra-aws-expert]]
  - [[be-fastapi-expert]]
  - [[be-go-backend-expert]]
---

# infra-docker-expert

Expert Docker engineer for optimized container images, multi-stage builds, container security hardening, Docker Compose configurations, and image size optimization.

## Overview

`infra-docker-expert` is the designated agent for all container-related work per R010 delegation rules — including server deployments via Docker, Docker Compose orchestration, and server state changes (restart, env vars). It designs optimized Dockerfiles with multi-stage builds, applies security best practices (non-root users, read-only filesystems, secret scanning), minimizes image layers and size, and configures Docker Compose for development and production.

Uses `docker-best-practices` skill and `guides/docker/`. Memory is `user`-scoped for cross-project Docker knowledge.

## Key Details

- **Model**: sonnet
- **Domain**: devops
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `docker-best-practices`
- **Memory**: user (cross-project Docker knowledge)
- **Effort**: medium

## Relationships

- **Depends on**: `docker-best-practices` skill, `guides/docker/`
- **Used by**: R010 delegation table ("Server deployment (docker, scp)", "Server state changes"), `secretary-routing`
- **See also**: [[infra-aws-expert]] (ECS/EKS deployment), [[be-fastapi-expert]] (containerized FastAPI), [[be-go-backend-expert]] (containerized Go services)

## Sources

- `.claude/agents/infra-docker-expert.md` — agent definition
