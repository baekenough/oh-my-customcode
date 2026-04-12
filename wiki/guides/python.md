---
title: "Python Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/python/pep8-style-guide.md
related:
  - [[lang-python-expert]]
  - [[python-best-practices]]
---

# Python Guide

Reference documentation for idiomatic Python coding style, PEP 8 conventions, and modern Python patterns.

## Overview

Covers PEP 8 style guide (indentation, line length, imports, naming), Pythonic idioms, type hints, dataclasses, async/await patterns, and testing with `pytest`. The guiding principle is readability: code is read more often than written. Used by `lang-python-expert` for Python language tasks across all Python frameworks.

## Key Topics

- PEP 8: 4-space indentation, 79-char line limit, import ordering (stdlib → third-party → local)
- Naming: `snake_case` functions/variables, `UpperCamelCase` classes, `SCREAMING_SNAKE` constants
- Type hints and `mypy` static typing
- Dataclasses and `__slots__` for performance
- Comprehensions vs generator expressions
- `pathlib` over `os.path`, f-strings over `.format()`
- `pytest` patterns and fixtures

## Relationships

- **Used by agents**: [[lang-python-expert]], [[be-fastapi-expert]], [[be-django-expert]]
- **Related skills**: [[python-best-practices]]
- **See also**: [[fastapi]], [[django-best-practices]], [[alembic]]

## Sources

- `guides/python/pep8-style-guide.md` — PEP 8 conventions, indentation, naming, imports
