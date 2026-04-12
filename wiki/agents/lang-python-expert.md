---
title: lang-python-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/lang-python-expert.md
related:
  - [[be-fastapi-expert]]
  - [[be-django-expert]]
  - [[lang-golang-expert]]
  - [[lang-typescript-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java21-expert]]
  - [[lang-rust-expert]]
---

# lang-python-expert

Expert Python developer for writing Pythonic, clean code following PEP 8 and The Zen of Python, with expertise in API design, exception handling, and performance optimization.

## Overview

`lang-python-expert` handles Python language work — writing idiomatic code following PEP 8 guidelines, reviewing and refactoring for best practices, designing clean module APIs, implementing proper exception handling hierarchies, and optimizing performance. It applies The Zen of Python principles (explicit is better than implicit, simple is better than complex, etc.) and serves as the language foundation for [[be-fastapi-expert]] and [[be-django-expert]].

Uses `python-best-practices` skill and `guides/python/`.

## Key Details

- **Model**: sonnet
- **Domain**: backend
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `python-best-practices`
- **Memory**: project
- **Effort**: high

## Relationships

- **Depends on**: `python-best-practices` skill, `guides/python/`
- **Used by**: `dev-lead-routing` skill (Python language task routing), R010 delegation table ("Python/FastAPI")
- **See also**: [[be-fastapi-expert]] (FastAPI framework), [[be-django-expert]] (Django framework), [[lang-golang-expert]], [[lang-typescript-expert]], [[lang-kotlin-expert]], [[lang-java21-expert]], [[lang-rust-expert]]

## Sources

- `.claude/agents/lang-python-expert.md` — agent definition
