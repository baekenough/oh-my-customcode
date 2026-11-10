---
title: Python Best Practices
type: skill
updated: 2026-11-09
sources:
  - .claude/skills/python-best-practices/SKILL.md
related:
  - [[lang-python-expert]]
  - [[fastapi-best-practices]]
  - [[skills/django-best-practices|django-best-practices]]
---

# Python Best Practices

Pythonic patterns from PEP 8 and PEP 20, with a version-gated modern-Python baseline.

## Overview

The skill covers PEP 8 code layout, imports, whitespace, naming, comments and docstrings, programming recommendations (including modern type hints), a few Pythonic idioms (list comprehensions, context managers, unpacking, `enumerate`, `dict.get`), tooling, and optional newer language features. Used by [[lang-python-expert]]. It does not teach dataclasses, generator expressions, `pathlib`, f-strings, the walrus operator, structural pattern matching, or async/await, and testing guidance is limited to a short tooling note on `pytest`.

## Key Rules by Section

- **Supported versions**: target Python 3.11 or newer unless the project pins another version, check `requires-python` in `pyproject.toml` before using newer syntax, and gate 3.12+/3.14+/3.15+ features on it. The supported-branch list is a measurement dated 2026-11 (as of that month) with source URLs and must be re-measured before relying on it.
- **Type hints**: write optional values as `X | None` (PEP 604), use built-in generics (`list[int]`) instead of `typing.List`, use PEP 695 type parameter syntax on 3.12+, and note that 3.14+ evaluates annotations lazily (PEP 649/749) while code that must run on earlier versions keeps quoted forward references.
- **Context managers and `open()`**: pass `encoding` explicitly for text files. From 3.15 (PEP 686) `open()` without it defaults to UTF-8 unless UTF-8 mode is disabled; earlier versions use the locale encoding.
- **Tooling**: `pyproject.toml` (PEP 621) for metadata, `uv` for environments and lockfiles with `pip` plus `venv` as fallback, `ruff` for linting and formatting, `mypy` for type checking, and `pytest` for tests. These are documented defaults, not a mandate; follow the tools the project already uses.
- **Optional newer features** (version-gated): free-threaded build, PEP 750 t-strings (3.14+), and PEP 810 explicit lazy imports (3.15+). Apply only when `requires-python` allows.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[lang-python-expert]]
- **Related skills**: [[fastapi-best-practices]], [[skills/django-best-practices|django-best-practices]], [[alembic-best-practices]]
- **See also**: guides/python/

## Sources

- `.claude/skills/python-best-practices/SKILL.md` — skill definition
