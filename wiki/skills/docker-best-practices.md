---
title: Docker Best Practices
type: skill
updated: 2026-11-10
sources:
  - .claude/skills/docker-best-practices/SKILL.md
related:
  - [[infra-docker-expert]]
  - [[aws-best-practices]]
---

# Docker Best Practices

Docker patterns for optimized container builds and production deployment.

## Overview

Reference patterns for Docker: multi-stage builds, minimal base images, layer caching optimization, non-root user setup, health checks, `.dockerignore` usage, secrets handling, and compose best practices. Example Dockerfiles use `golang:1.27`, `python:3.15-slim`, `python:3.15-alpine`, `node:26-slim` (digest-pinned example resolved 2026-11-10, with `docker buildx imagetools inspect` to resolve your own) and `alpine:3.24` base image tags. The distroless example builds in a full image and copies only the app into `gcr.io/distroless/nodejs26-debian13`; the Node.js example uses `npm ci --omit=dev`, and the Python multi-stage example builds a venv in `/opt/venv`, copies it to the final stage and runs as `USER nobody`. Used by `infra-docker-expert` when building or reviewing Dockerfiles and compose configurations.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[infra-docker-expert]]
- **Related skills**: [[aws-best-practices]]
- **See also**: guides/docker-best-practices/

## Sources

- `.claude/skills/docker-best-practices/SKILL.md` — skill definition
