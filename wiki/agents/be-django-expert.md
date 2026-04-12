---
title: be-django-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/be-django-expert.md
related:
  - [[lang-python-expert]]
  - [[be-fastapi-expert]]
  - [[db-postgres-expert]]
  - [[db-alembic-expert]]
---

# be-django-expert

Expert Django developer for production-ready Python web applications including models/views/templates, Django REST Framework, authentication, admin customization, and deployment optimization.

## Overview

`be-django-expert` specializes in building scalable Django applications following modern patterns. It handles the full Django stack: ORM with custom managers and querysets, class-based views, DRF APIs, Django admin customization, authentication/authorization, database query optimization (N+1 prevention, indexing), and secure deployment configuration.

The agent uses the `django-best-practices` skill and consults `guides/django-best-practices/` for authoritative patterns.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `django-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `django-best-practices` skill, `guides/django-best-practices/`
- **Used by**: `dev-lead-routing` skill (Python/Django task routing)
- **See also**: [[lang-python-expert]] (Python language patterns), [[be-fastapi-expert]] (async Python APIs), [[db-postgres-expert]] (database layer), [[db-alembic-expert]] (migrations)

## Sources

- `.claude/agents/be-django-expert.md` — agent definition
