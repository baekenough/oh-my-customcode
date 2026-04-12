---
title: "Django Best Practices Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/django-best-practices/README.md
related:
  - [[be-django-expert]]
  - [[django-best-practices]]
---

# Django Best Practices Guide

Reference documentation for Django production-ready application patterns based on Django 6.0 and community standards.

## Overview

Covers project structure, settings management, custom User models, REST API design, ORM query optimization, security hardening, and deployment checklists. Follows the HackSoft Django Styleguide for service/selector pattern separation. Used by `be-django-expert` for Python web application development.

## Key Topics

- Recommended project structure with `config/settings/` split (base/dev/prod)
- Custom User model and authentication setup
- Service/selector pattern for business logic separation
- Django REST Framework patterns and serializer design
- ORM optimization: `select_related`, `prefetch_related`, N+1 prevention
- Security checklist and production deployment
- Celery integration for async task processing

## Relationships

- **Used by agents**: [[be-django-expert]]
- **Related skills**: [[django-best-practices]]
- **See also**: [[fastapi]], [[python]], [[postgres]]

## Sources

- `guides/django-best-practices/README.md` — project structure, settings pattern, quick reference
