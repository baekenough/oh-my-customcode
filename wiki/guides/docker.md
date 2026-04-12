---
title: "Docker Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/docker/compose-best-practices.md
related:
  - [[infra-docker-expert]]
  - [[docker-best-practices]]
---

# Docker Guide

Reference documentation for Docker containerization patterns, Dockerfile best practices, and Docker Compose configuration.

## Overview

Covers Dockerfile optimization (multi-stage builds, layer caching, minimal images), Docker Compose service configuration, environment variable management, networking, health checks, and volume management. Also includes container security hardening and production deployment patterns. Used by `infra-docker-expert` for containerization and deployment tasks.

## Key Topics

- Dockerfile multi-stage build patterns
- Docker Compose service dependencies and health checks
- Environment variable management with `.env` files
- Named volumes and bind mounts
- Custom network configuration
- Build arguments and target stages
- Container security best practices

## Relationships

- **Used by agents**: [[infra-docker-expert]]
- **Related skills**: [[docker-best-practices]]
- **See also**: [[aws]], [[springboot]], [[fastapi]]

## Sources

- `guides/docker/compose-best-practices.md` — Compose file structure, service config, networking
