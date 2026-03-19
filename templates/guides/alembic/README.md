# Alembic Guide

Database migration framework for SQLAlchemy. Current stable: **1.18.x** (2025).

## Overview

Alembic is the de-facto migration tool for SQLAlchemy projects. It manages the evolution of a relational database schema over time through versioned migration scripts organized as a directed acyclic graph (DAG). Each migration is a Python file with `upgrade()` and `downgrade()` functions that emit SQLAlchemy Core operations or raw SQL.

**Relationship to SQLAlchemy**: Alembic depends on SQLAlchemy but operates at the DDL (schema) level, not the DML (data query) level. It uses SQLAlchemy's introspection API to compare the current database state against declared models, then generates the difference as migration ops.

**Philosophy**: Unlike Rails migrations or Django migrations, Alembic generates migration code that developers are expected to review and edit. Autogenerate is a starting point, not a final answer.

---

## Core Concepts

### Revision Chain (DAG)

Each migration file has:
- `revision`: unique identifier (e.g., `a1b2c3d4e5f6`)
- `down_revision`: parent revision(s) — `None` for the first migration, a tuple for merge points

The chain forms a DAG. `alembic upgrade head` walks the graph from the current DB revision to the tip(s). Branches can exist and are resolved with merge migrations.

```
None → a1b2 → c3d4 → e5f6 (head)
                   ↘ g7h8 → merge(e5f6, g7h8) (merged head)
```

### env.py

The bridge between Alembic and the application. Responsibilities:
1. Configure the SQLAlchemy engine/connection URL
2. Set `target_metadata` (SQLAlchemy `MetaData` with all models imported)
3. Define `run_migrations_offline()` and `run_migrations_online()` functions
4. Optionally override `alembic.ini` settings (e.g., inject `DATABASE_URL` from env vars)

### alembic.ini

Main configuration file. Key settings:
- `script_location` — path to `alembic/` directory
- `sqlalchemy.url` — database URL (should be overridden in `env.py` from env vars)
- `file_template` — naming pattern for generated migration files
- `prepend_sys_path` — adds project root to `sys.path` so `env.py` can import models

### script.py.mako

Mako template used to generate new migration files. Default template includes the `revision`, `down_revision`, `branch_labels`, `depends_on` header and empty `upgrade()`/`downgrade()` stubs.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `alembic init <dir>` | Initialize a new Alembic environment in `<dir>` |
| `alembic revision -m "message"` | Create a new empty migration |
| `alembic revision --autogenerate -m "message"` | Generate migration from model diff |
| `alembic upgrade head` | Apply all pending migrations |
| `alembic upgrade +1` | Apply the next one migration |
| `alembic upgrade <rev>` | Apply migrations up to `<rev>` |
| `alembic downgrade -1` | Revert the most recent migration |
| `alembic downgrade base` | Revert all migrations |
| `alembic downgrade <rev>` | Revert to `<rev>` |
| `alembic current` | Show current revision(s) applied to the DB |
| `alembic history` | Show full revision history |
| `alembic heads` | Show all head revisions (should be 1 in linear projects) |
| `alembic branches` | Show branch points |
| `alembic merge <rev1> <rev2> -m "merge"` | Create a merge migration |
| `alembic check` | Exit non-zero if models have changes not yet reflected in migrations |
| `alembic upgrade head --sql` | Print SQL statements without executing (offline mode) |

---

## Operations Reference

### Table Operations
| Op | Description |
|----|-------------|
| `op.create_table(name, *cols)` | Create table |
| `op.drop_table(name)` | Drop table |
| `op.rename_table(old, new)` | Rename table |

### Column Operations
| Op | Description |
|----|-------------|
| `op.add_column(table, column)` | Add column |
| `op.drop_column(table, col_name)` | Drop column |
| `op.alter_column(table, col_name, ...)` | Change type, nullable, default, name |

### Index Operations
| Op | Description |
|----|-------------|
| `op.create_index(name, table, cols)` | Create index |
| `op.drop_index(name, table)` | Drop index |
| `op.create_index(..., postgresql_concurrently=True)` | Non-locking index (PG only) |

### Constraint Operations
| Op | Description |
|----|-------------|
| `op.create_unique_constraint(name, table, cols)` | Unique constraint |
| `op.drop_constraint(name, table)` | Drop constraint |
| `op.create_foreign_key(name, src_table, ref_table, lcols, rcols)` | FK constraint |
| `op.create_check_constraint(name, table, condition)` | Check constraint |

### Data & Raw SQL
| Op | Description |
|----|-------------|
| `op.execute(sql)` | Run raw SQL string or `text()` |
| `op.bulk_insert(table, rows)` | Insert list of dicts |
| `op.get_bind()` | Get the active connection for custom queries |

### Batch (SQLite / locked tables)
```python
with op.batch_alter_table("users") as batch_op:
    batch_op.add_column(sa.Column("age", sa.Integer()))
    batch_op.alter_column("name", nullable=False)
```

---

## Configuration Patterns

### Sync (Default)

```python
# env.py
import os
from sqlalchemy import engine_from_config, pool
from alembic import context
from myapp.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
target_metadata = Base.metadata

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
```

### Async (asyncpg)

```python
# env.py — async pattern
import asyncio, os
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from myapp.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
target_metadata = Base.metadata

async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(
            lambda conn: context.configure(conn, target_metadata=target_metadata)
        )
        async with connectable.begin() as trans:
            await connection.run_sync(lambda _: context.run_migrations())
    await connectable.dispose()

asyncio.run(run_migrations_online())
```

### Multi-Tenant (Schema Per Tenant)

```python
# env.py — schema-per-tenant pattern
import os
from alembic import context

TENANT_SCHEMAS = os.environ.get("TENANT_SCHEMAS", "public").split(",")

def run_migrations_online():
    connectable = engine_from_config(...)
    with connectable.connect() as connection:
        for schema in TENANT_SCHEMAS:
            connection.execute(text(f"SET search_path TO {schema}"))
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                version_table_schema=schema,
                include_schemas=True,
            )
            with context.begin_transaction():
                context.run_migrations()
```

### Multi-Database

Use separate `alembic/` directories (one per database), each with its own `alembic.ini` and `env.py`. Invoke as:

```bash
alembic -c alembic_orders.ini upgrade head
alembic -c alembic_users.ini upgrade head
```

---

## Integration

### FastAPI

Use lifespan events to run migrations on startup in development:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from alembic.config import Config
from alembic import command

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run migrations on startup (dev/test only — use CI in production)
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield

app = FastAPI(lifespan=lifespan)
```

For production, run migrations as a separate step before the application starts (init container, pre-deploy hook, or CI step).

### Flask-Migrate

Flask-Migrate wraps Alembic for Flask applications. It adds `flask db init`, `flask db migrate`, `flask db upgrade` commands. Under the hood it calls the same Alembic Python API. Alembic knowledge transfers directly; only the CLI surface differs.

### Docker / Kubernetes

Run migrations as a Kubernetes init container or Docker Compose `depends_on` service:

```yaml
# docker-compose.yml
services:
  migrate:
    image: myapp:latest
    command: alembic upgrade head
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/mydb
    depends_on:
      db:
        condition: service_healthy

  app:
    image: myapp:latest
    depends_on:
      migrate:
        condition: service_completed_successfully
```

### pytest-alembic

```bash
pip install pytest-alembic
```

Provides fixtures (`alembic_config`, `alembic_engine`, `alembic_runner`) and built-in tests. Add `--test-alembic` flag or run `pytest tests/test_migrations.py`. See `alembic-best-practices` skill for full setup.

---

## Comparison

| Feature | Alembic | Atlas (HashiCorp) | Django Migrations | Flyway | Liquibase |
|---------|---------|-------------------|-------------------|--------|-----------|
| Language | Python | Go / HCL | Python | Java | Java / XML |
| Migration format | Python scripts | HCL / SQL | Python auto-generated | SQL files | XML / YAML / SQL |
| Autogenerate | Yes (SQLAlchemy) | Yes (schema diff) | Yes (ORM diff) | No | No |
| Downgrade support | Yes | Partial | Yes | Yes (Undo) | Yes (Rollback) |
| Multi-DB | Manual | Built-in | Manual | Built-in | Built-in |
| Async support | Yes (v1.11+) | N/A | No | N/A | N/A |
| PG objects (views, etc.) | Via alembic-utils | Native HCL | No | SQL only | SQL only |
| Lock analysis | Via Squawk | Built-in lint | None | None | None |
| Best for | SQLAlchemy / Python projects | Infra-as-code DB schemas | Django projects | JVM projects | Enterprise / multi-engine |

---

## Security

### Credential Management

Never embed database credentials in `alembic.ini`. Always source from environment variables in `env.py`:

```python
import os
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
```

Use secret management (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets) to inject `DATABASE_URL` at runtime.

### Migration Script Integrity

- Commit migration files to version control — do not generate them on the fly in CI
- Use `alembic check` in CI to verify no uncommitted model changes exist
- Review all autogenerated migrations before merging — they are code, not config

### Database Permission Separation

| Role | Permissions | Used by |
|------|------------|---------|
| Migration role | `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` on schema | Alembic only |
| Application role | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables | Application at runtime |
| Read-only role | `SELECT` only | Reporting, analytics |

Run `alembic upgrade head` with the migration role, not the application role. The application should never have `DROP TABLE` or `ALTER TABLE` permissions.

---

## Advanced Topics

### Batch Operations (SQLite)

SQLite does not support `ALTER TABLE` for most operations. Use `batch_alter_table` which recreates the table:

```python
with op.batch_alter_table("users", schema=None) as batch_op:
    batch_op.alter_column("email", nullable=False)
    batch_op.drop_constraint("uq_users_username", type_="unique")
```

Set `render_as_batch=True` in `env.py` to make autogenerate always emit batch operations for SQLite projects.

### Offline Mode

Generate SQL without a live database:

```bash
alembic upgrade head --sql > migration.sql
```

Useful for: production deployments (run SQL through DBA review), Squawk lint analysis, audit trails.

### Branching and Merging

When two developers create migrations from the same base revision, a branch forms. Resolve with:

```bash
alembic merge <rev1> <rev2> -m "merge parallel migrations"
```

The merge migration has both revisions in `down_revision` as a tuple:

```python
down_revision = ("a1b2c3d4", "e5f6g7h8")
```

### Custom Operations

Extend Alembic with project-specific ops:

```python
# migrations/ops.py
from alembic.operations import Operations, MigrateOperation

@Operations.register_operation("create_sequence")
class CreateSequenceOp(MigrateOperation):
    def __init__(self, sequence_name, schema=None):
        self.sequence_name = sequence_name
        self.schema = schema

    @classmethod
    def create_sequence(cls, operations, sequence_name, **kw):
        op = CreateSequenceOp(sequence_name, **kw)
        return operations.invoke(op)

@Operations.implementation_for(CreateSequenceOp)
def create_sequence(operations, operation):
    operations.execute(f"CREATE SEQUENCE {operation.sequence_name}")
```

### Replaceable Objects (alembic-utils)

For PostgreSQL objects that are replaced entirely on change (views, functions, triggers, RLS policies), use `alembic-utils` to manage them as Replaceable Objects. Register with autogenerate so diffs are automatically detected:

```python
# env.py
from alembic_utils.replaceable_entity import register_entities
from myapp.db.views import user_summary_view, active_orders_view

register_entities([user_summary_view, active_orders_view])
```

---

## Ecosystem

| Package | Purpose | Maturity |
|---------|---------|---------|
| `alembic-utils` | PostgreSQL Replaceable Objects: views, functions, triggers, RLS | Stable |
| `alembic-postgresql-enum` | Add enum values without full table recreate | Stable |
| `pytest-alembic` | Migration test fixtures and built-in test cases | Stable |
| `audit-alembic` | Attach migration context to audit log | Beta |
| `Squawk` | Static DDL linter for lock-risk patterns | Stable |
| `pgai Vectorizer` | AI-enabled column vectorization via migrations | Experimental |
| `Atlas` | Alternative migration engine with HCL-based schema | Stable (separate tool) |

---

## Quick Reference

```bash
# Initial setup
pip install alembic sqlalchemy
alembic init alembic

# Daily workflow
alembic revision --autogenerate -m "add user preferences table"
# → Review generated file in alembic/versions/
alembic upgrade head

# Check / verify
alembic current
alembic history --verbose
alembic check  # fails if models have unmigrated changes

# Rollback
alembic downgrade -1

# Branching
alembic merge rev1 rev2 -m "merge branches"

# Offline SQL
alembic upgrade head --sql | squawk  # lint before applying
```
