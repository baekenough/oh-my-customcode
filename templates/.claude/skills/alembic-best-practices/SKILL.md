---
name: alembic-best-practices
description: Alembic migration patterns for naming conventions, safety checks, expand-contract, env.py configuration, and CI integration
scope: core
version: 1.0.0
user-invocable: false
---

# Alembic Best Practices

Reference patterns for safe, maintainable Alembic database migrations.

## 1. Naming Convention

Always set `naming_convention` on `MetaData` before autogenerate runs. Without it, constraint names are database-generated and differ across engines, causing migration drift.

```python
from sqlalchemy import MetaData

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=convention)
```

Set `file_template` in `alembic.ini` for timestamp-prefixed filenames:

```ini
file_template = %%(year)d%%(month).2d%%(day).2d_%%(hour).2d%%(minute).2d_%%(rev)s_%%(slug)s
```

## 2. Credential Management

**NEVER** store database credentials in `alembic.ini` or commit them to version control.

Override `sqlalchemy.url` in `env.py` from environment variables:

```python
# env.py — override alembic.ini URL with environment variable
import os
from alembic import context

config = context.config
db_url = os.environ.get("DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)
```

For PostgreSQL + asyncpg, ensure the sync URL uses `postgresql+psycopg2` (or `postgresql`) for offline/sync contexts and `postgresql+asyncpg` only for async contexts.

## 3. Autogenerate Trust Matrix

Autogenerate is a starting point, not a final answer. Always review generated scripts.

| Object / Change | Autogenerate Detects | Notes |
|-----------------|----------------------|-------|
| Table add/drop | Yes | Reliable |
| Column add/drop | Yes | Reliable |
| Column type change | Partial | Type equivalence varies by backend |
| Column rename | **Never** | Generates drop+add — will destroy data |
| Index add/drop | Yes | Only if reflected or declared |
| Named constraint add/drop | Yes | Requires `naming_convention` on MetaData |
| Anonymous constraint | **No** | No name = no detection |
| Default value change | Partial | Server defaults vs client defaults differ |
| PostgreSQL views / functions | **No** | Use alembic-utils |
| PostgreSQL enum add value | Partial | Requires `alembic-postgresql-enum` |
| Sequence changes | No | Manual op required |

## 4. Dangerous Pattern Detection

Review every generated migration against this checklist before committing:

**CRITICAL — Review Required:**

- [ ] `op.drop_column` + `op.add_column` on the same column name → likely unintended rename; confirm with user
- [ ] `op.create_foreign_key(None, ...)` → anonymous FK; must have an explicit name
- [ ] `op.add_column` with `nullable=False` and no `server_default` on a non-empty table → full-table rewrite, lock risk
- [ ] `op.create_index` without `postgresql_concurrently=True` on a large table → table-level lock
- [ ] `op.drop_table` or `op.drop_column` → confirm there are no application references
- [ ] Empty `def downgrade(): pass` → document justification or implement rollback
- [ ] `op.alter_column` type change across incompatible types (e.g., `VARCHAR` → `INTEGER`) → data loss risk

**WARNING — Verify Intent:**

- [ ] Multiple heads detected (`alembic heads` shows 2+) → merge before deploying
- [ ] `batch_alter_table` missing for SQLite → required for constraint modifications on SQLite
- [ ] `render_as_batch=True` not set in `env.py` for SQLite projects

## 5. Expand-Contract Pattern

For zero-downtime schema changes on live tables, use three separate migration phases:

**Phase 1 — Expand** (deploy without application changes):
```python
def upgrade():
    op.add_column("users", sa.Column("email_new", sa.String(255), nullable=True))

def downgrade():
    op.drop_column("users", "email_new")
```

**Phase 2 — Migrate** (data backfill, can run during deploy):
```python
def upgrade():
    op.execute("""
        UPDATE users SET email_new = email WHERE email_new IS NULL
    """)

def downgrade():
    pass  # Data loss acceptable; backfill was additive
```

**Phase 3 — Contract** (after all application nodes use new column):
```python
def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("email_new", nullable=False)
    op.drop_column("users", "email")
    op.alter_column("users", "email_new", new_column_name="email")

def downgrade():
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.execute("UPDATE users SET email = email_new WHERE email IS NULL")
    op.drop_column("users", "email_new")
```

## 6. Async env.py

Canonical pattern for async SQLAlchemy (asyncpg) with Alembic:

```python
# env.py — async configuration
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from myapp.models import Base  # Import all models here

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # Required: avoids pool issues during migration
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

Key points:
- Use `NullPool` — migration scripts are one-shot; pooling causes connection leaks
- Import ALL models in `env.py` (directly or via a central `models/__init__.py`) so autogenerate sees every table
- `run_sync` bridges the async connection back to Alembic's sync API

## 7. Testing with pytest-alembic

Install: `pip install pytest-alembic`

Built-in tests (all enabled by default):

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from alembic.config import Config

@pytest.fixture
def alembic_config():
    return Config("alembic.ini")

@pytest.fixture
def alembic_engine():
    return create_engine("postgresql://test_user:test_pass@localhost/test_db")
```

Built-in test assertions:
- `test_single_head_revision` — exactly one head revision exists
- `test_upgrade` — all upgrades apply without error
- `test_model_definitions_match_ddl` — SQLAlchemy models match the migrated schema
- `test_up_down_consistency` — every upgrade can be cleanly downgraded

Custom data migration test:
```python
@pytest.mark.alembic
def test_user_email_backfill(alembic_runner):
    # Insert data before migration
    alembic_runner.migrate_up_before("abc123def456")
    alembic_runner.insert_into("users", [{"id": 1, "email": "test@example.com"}])

    # Apply the migration
    alembic_runner.migrate_up_one()

    # Assert post-migration state
    result = alembic_runner.execute("SELECT email_new FROM users WHERE id = 1")
    assert result.scalar() == "test@example.com"
```

## 8. CI Integration

**Detect uncommitted migrations** — fail CI if models changed but no migration was generated:

```yaml
# .github/workflows/migrations.yml
- name: Check for pending migrations
  run: alembic check
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

**Squawk** — static analysis for lock-risk DDL (no live DB required):

```yaml
- name: Install Squawk
  run: pip install squawk-cli  # or: brew install squawk

- name: Lint migrations for lock risks
  run: |
    alembic upgrade head --sql > migration.sql
    squawk migration.sql
```

Squawk detects: non-concurrent index creation, adding NOT NULL without default, renaming columns, dropping constraints without cascade, and other patterns that cause long locks.

## 9. Extensions

| Package | Purpose | Install |
|---------|---------|---------|
| `alembic-utils` | Replaceable PG objects: views, functions, triggers, RLS policies | `pip install alembic-utils` |
| `alembic-postgresql-enum` | Safe enum value additions without full table rewrites | `pip install alembic-postgresql-enum` |
| `audit-alembic` | Attach migration metadata to audit log tables | `pip install audit-alembic` |
| `sqla-utils` | Additional SQLAlchemy model utilities complementing alembic-utils | `pip install sqla-utils` |

### alembic-utils example (PostgreSQL view):

```python
from alembic_utils.pg_view import PGView

user_summary_view = PGView(
    schema="public",
    signature="user_summary",
    definition="SELECT id, email, created_at FROM users WHERE active = true",
)

# In env.py — register with autogenerate
from alembic_utils.replaceable_entity import register_entities
register_entities([user_summary_view])
```

## 10. Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Empty `target_metadata` | Autogenerate produces empty migration | Import all models in `env.py` before `Base.metadata` is referenced |
| Multiple heads | `alembic upgrade head` fails with merge conflict error | Run `alembic merge heads -m "merge"` |
| SQLite constraint modification | `NotImplementedError` on `op.alter_column` | Use `op.batch_alter_table` context manager |
| asyncpg URL in offline mode | `Can't load plugin: sqlalchemy.dialects:postgresql+asyncpg` | Use sync URL (`postgresql://`) for offline mode; override only for async online mode |
| Missing model imports | Tables not detected by autogenerate | Add `from myapp import models` to `env.py` (not just `Base`) |
| `server_default` vs `default` | `server_default` needed for NOT NULL on existing rows | Use `server_default=sa.text("''")`; remove it in the Contract phase |
