# Modern Python Practices

Companion to the `python-best-practices` skill (§6 type hints, §7 idioms, §8 Tooling, §9 newer features). Check `requires-python` in `pyproject.toml` before using any version-gated feature below.

## Type Hints

| Topic | Guidance | Source |
|-------|----------|--------|
| Optional values | Write `X \| None`, not `Optional[X]` (3.10+) | [PEP 604](https://peps.python.org/pep-0604/) |
| Generics | Use built-in `list[int]`, `dict[str, int]` instead of `typing.List` / `typing.Dict` | [PEP 585](https://peps.python.org/pep-0585/) |
| Type parameters | 3.12+: `def first[T](items: list[T]) -> T` and the `type` statement | [PEP 695](https://peps.python.org/pep-0695/) |
| Forward references | 3.14+: annotations are evaluated lazily, so no quotes or `from __future__ import annotations`; code that must run on older versions keeps them | [PEP 649](https://peps.python.org/pep-0649/), [PEP 749](https://peps.python.org/pep-0749/) |

```python
def find_user(user_id: int) -> str | None:
    ...
```

## Text Files and Encoding

Pass `encoding="utf-8"` to `open()` for text files.

- Before 3.15, `open()` without `encoding` uses the locale encoding, unless UTF-8 mode is on (`-X utf8=1`, `PYTHONUTF8=1`, or automatically under the C/POSIX locale; [PEP 540](https://peps.python.org/pep-0540/)).
- From 3.15, UTF-8 mode is on by default ([PEP 686](https://peps.python.org/pep-0686/)); `PYTHONUTF8=0` or `-X utf8=0` turns it off again.
- Measured on 3.14.2: `LC_ALL=C` gives `sys.flags.utf8_mode == 1` and UTF-8; `LC_ALL=C PYTHONUTF8=0` gives US-ASCII; `LC_ALL=en_US.ISO8859-1` gives ISO8859-1.

## Tooling

These are widely used defaults, not a mandate. Follow the tools the project already uses.

| Area | Default | Notes |
|------|---------|-------|
| Packaging | `pyproject.toml` ([PEP 621](https://peps.python.org/pep-0621/)) | `requires-python` states the supported baseline |
| Environments | [uv](https://docs.astral.sh/uv/); `venv` + `pip` as fallback | |
| Lint / format | [ruff](https://docs.astral.sh/ruff/) | configure under `[tool.ruff]` |
| Type checking | [mypy](https://mypy.readthedocs.io/) | run in CI |
| Tests | [pytest](https://docs.pytest.org/) | `tests/`, files named `test_*.py` |

## Newer Language Features (version-gated)

| Feature | Version | Note | Source |
|---------|---------|------|--------|
| Free-threaded build | experimental 3.13; supported from 3.14 | opt-in; verify C-extension support | [PEP 703](https://peps.python.org/pep-0703/), [PEP 779](https://peps.python.org/pep-0779/) |
| Template strings | 3.14+ | `t"Hello {name}"` yields a `Template`, not a `str`; process it before use (SQL, HTML) | [PEP 750](https://peps.python.org/pep-0750/) |
| Explicit lazy imports | 3.15+ | `lazy import json` defers loading until first use; module level only: inside a function, a class or a `try`/`except` block, a lazy star import and a lazy `from __future__` import are `SyntaxError`s | [PEP 810](https://peps.python.org/pep-0810/) |
