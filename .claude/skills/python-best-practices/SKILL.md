---
name: python-best-practices
description: Pythonic patterns from PEP 8 and PEP 20
scope: core
user-invocable: false
---

## Purpose

Apply idiomatic Python patterns and best practices from official Python documentation.

## Supported Python Versions

```yaml
baseline:
  - Target Python 3.11 or newer unless the project pins another version
  - Check requires-python in pyproject.toml before using newer syntax
  - Gate version-specific features (3.12+, 3.14+, 3.15+) on that setting

measured_2026-11:
  - Supported branches: 3.15 and 3.14 (bugfix), 3.13, 3.12 and 3.11 (security)
  - 3.10 is end-of-life since 2026-10-01
  - Source: https://devguide.python.org/versions/
  - Latest release at measurement time: 3.15.2 (https://www.python.org/downloads/)
```

## The Zen of Python (PEP 20)

```
Beautiful is better than ugly.
Explicit is better than implicit.
Simple is better than complex.
Complex is better than complicated.
Flat is better than nested.
Sparse is better than dense.
Readability counts.
Special cases aren't special enough to break the rules.
Although practicality beats purity.
Errors should never pass silently.
Unless explicitly silenced.
In the face of ambiguity, refuse the temptation to guess.
There should be one-- and preferably only one --obvious way to do it.
Although that way may not be obvious at first unless you're Dutch.
Now is better than never.
Although never is often better than *right* now.
If the implementation is hard to explain, it's a bad idea.
If the implementation is easy to explain, it may be a good idea.
Namespaces are one honking great idea -- let's do more of those!
```

## Rules

### 1. Code Layout

```yaml
indentation:
  - Use 4 spaces per indentation level
  - Never mix tabs and spaces
  - Continuation lines align vertically or use hanging indent

line_length:
  - Maximum 79 characters for code
  - Maximum 72 characters for docstrings/comments
  - Teams may agree on 99 characters for code

blank_lines:
  - Two blank lines around top-level definitions
  - One blank line between method definitions
  - Use sparingly inside functions
```

### 2. Imports

```yaml
rules:
  - One import per line
  - Position at file top, after docstrings
  - Group order: standard library → third-party → local
  - Separate groups with blank lines
  - Prefer absolute imports
  - Avoid wildcard imports (from X import *)

example: |
  import os
  import sys

  from third_party import lib

  from myproject import module
```

### 3. Whitespace

```yaml
avoid:
  - Extra spaces inside parentheses/brackets
  - Spaces before commas or colons
  - Spaces between function name and parenthesis
  - Multiple spaces for alignment

required:
  - Single space around binary operators
  - Spaces around -> in annotations
  - No spaces around = for default parameters
```

### 4. Naming Conventions

```yaml
modules_packages:
  style: lowercase_with_underscores
  example: my_module

classes:
  style: CapWords
  example: MyClass

functions_variables:
  style: lowercase_with_underscores
  example: my_function, my_variable

constants:
  style: ALL_CAPS_WITH_UNDERSCORES
  example: MAX_SIZE, DEFAULT_VALUE

exceptions:
  style: CapWords + Error suffix
  example: ValueError, CustomError

private:
  single_underscore: _internal (weak internal)
  double_underscore: __private (name mangling)
  trailing_underscore: class_ (avoid keyword conflict)

avoid:
  - Single characters l, O, I (ambiguous)
```

### 5. Comments and Docstrings

```yaml
principles:
  - Comments contradicting code are worse than none
  - Use complete sentences
  - Keep comments up to date

block_comments:
  - Indent at same level as code
  - Start each line with # and space

inline_comments:
  - Minimum two spaces from code
  - Avoid obvious statements

docstrings:
  - Write for all public modules, functions, classes, methods
  - Use triple quotes
  - First line: concise summary
  - Blank line before detailed description
```

### 6. Programming Recommendations

```yaml
comparisons:
  - Use 'is' and 'is not' for None, True, False
  - Prefer isinstance() over type()
  - Use 'is not' rather than 'not ... is'

sequences:
  - Test empty: if not seq: (not if len(seq) == 0)
  - Use .startswith() and .endswith()

exceptions:
  - Derive from Exception, not BaseException
  - Catch specific exceptions
  - Avoid bare except clauses
  - Use 'raise X from Y' for chaining

functions:
  - Use def, not lambda assignment
  - Consistent return statements
  - Use with for resource management

type_hints:
  - Follow PEP 484 syntax
  - Space after colon in annotations
  - No space before colon
  - Write optional values as X | None (PEP 604), not Optional[X]
  - Use built-in generics (list[int], dict[str, int]) instead of typing.List / typing.Dict
  - "3.12+: use PEP 695 type parameter syntax (def first[T](items: list[T]) -> T) and the type statement"
  - "3.14+: annotations are evaluated lazily (PEP 649/749), so forward references in annotations need no quotes or from __future__ import annotations"
  - "Code that must also run on versions before 3.14 keeps quoted forward references or uses from __future__ import annotations"

example: |
  def find_user(user_id: int) -> str | None:
      ...

  def first[T](items: list[T]) -> T:  # Python 3.12+ (PEP 695)
      return items[0]
```

### 7. Pythonic Idioms

```yaml
list_comprehension:
  prefer: "[x*2 for x in items if x > 0]"
  over: |
    result = []
    for x in items:
        if x > 0:
            result.append(x*2)

context_managers:
  prefer: "with open('file', encoding='utf-8') as f:"
  over: |
    f = open('file')
    try:
        ...
    finally:
        f.close()
  note: |
    Pass encoding explicitly for text files. Before 3.15, open() without
    encoding uses the locale encoding; from 3.15 (PEP 686) it uses UTF-8
    unless UTF-8 mode is disabled (PYTHONUTF8=0 or -X utf8=0). Code that
    must also run on earlier versions still passes encoding=.

unpacking:
  prefer: "a, b = b, a"
  over: |
    temp = a
    a = b
    b = temp

enumerate:
  prefer: "for i, item in enumerate(items):"
  over: "for i in range(len(items)):"

dictionary:
  prefer: "d.get(key, default)"
  over: "d[key] if key in d else default"
```

### 8. Tooling

```yaml
note: Defaults below are widely documented tools, not a mandate. Follow the tools the project already uses.

packaging:
  - Declare project metadata and dependencies in pyproject.toml (PEP 621)
  - requires-python states the supported baseline
  - uv manages environments, dependencies and lockfiles (https://docs.astral.sh/uv/)
  - pip with the standard-library venv module remains the baseline fallback

linting_formatting:
  - ruff provides linting and formatting (https://docs.astral.sh/ruff/)
  - Configure it under [tool.ruff] in pyproject.toml

type_checking:
  - mypy checks type hints (https://mypy.readthedocs.io/)
  - Run it in CI so annotations stay correct

testing:
  - pytest runs tests (https://docs.pytest.org/)
  - Keep tests under tests/ and name files test_*.py
```

### 9. Optional: Newer Language Features (version-gated)

```yaml
note: Use only when requires-python allows it. Do not apply to projects that target older versions.

free_threading:
  - Free-threaded build (GIL disabled; PEP 703, experimental in 3.13; officially supported from 3.14 per PEP 779)
  - Opt-in build; verify that C-extension dependencies support it

template_strings:
  - PEP 750 t-strings (3.14+): t"Hello {name}" yields a Template, not a str
  - Use for safe interpolation (SQL, HTML); process the Template before use

lazy_imports:
  - PEP 810 explicit lazy imports (3.15+): "lazy import json" defers loading until first use (module scope only)
  - Useful for startup time in CLI tools

example: |
  name = "world"
  template = t"Hello {name}"  # 3.14+ only
  print(type(template).__name__)
```

## Application

When writing or reviewing Python code:

1. **Always** follow PEP 8 formatting
2. **Always** write docstrings for public APIs
3. **Prefer** explicit over implicit
4. **Prefer** simple over complex
5. **Prefer** flat over nested
6. **Avoid** premature optimization
7. **Use** list comprehensions when readable
8. **Use** context managers for resources
