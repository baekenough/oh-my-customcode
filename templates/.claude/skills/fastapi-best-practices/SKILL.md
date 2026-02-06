---
name: fastapi-best-practices
description: FastAPI patterns for high-performance async APIs
user-invocable: false
---

## Purpose

Apply FastAPI patterns for building high-performance async APIs.

## Rules

### 1. Project Structure

```yaml
structure:
  domain_based: true
  module_contents:
    - router.py: API endpoints
    - schemas.py: Pydantic models
    - models.py: Database models
    - service.py: Business logic
    - dependencies.py: Route validators
    - constants.py: Module constants
    - config.py: Module configuration
    - exceptions.py: Custom exceptions
    - utils.py: Helper functions

imports:
  style: explicit
  example: "from src.auth import constants as auth_constants"

layout: |
  src/
  ├── auth/
  │   ├── router.py
  │   ├── schemas.py
  │   ├── models.py
  │   ├── service.py
  │   └── dependencies.py
  ├── users/
  │   └── ...
  ├── config.py
  └── main.py
```

### 2. Async Patterns

```yaml
io_intensive:
  use: "async def"
  await: "asyncio.sleep(), httpx, asyncpg, etc."
  example: |
    async def fetch_data():
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            return response.json()

sync_io:
  use: "def (regular function)"
  reason: FastAPI offloads to threadpool automatically
  example: |
    def read_file():
        with open('file.txt') as f:
            return f.read()

cpu_intensive:
  avoid: async and threadpool
  use: separate worker processes
  example: "Use Celery or multiprocessing"

never:
  - "time.sleep() in async functions"
  - "Blocking I/O in async functions"
```

### 3. Pydantic Models

```yaml
validation:
  use_builtin: regex, enums, email, URL validators
  custom_validators: for complex logic

base_model:
  create_custom: true
  purpose: enforce application-wide standards
  example: |
    from pydantic import BaseModel
    from datetime import datetime

    class AppBaseModel(BaseModel):
        class Config:
            from_attributes = True
            json_encoders = {
                datetime: lambda v: v.isoformat()
            }

settings:
  split: across modules
  avoid: single global configuration
  example: |
    # auth/config.py
    class AuthSettings(BaseSettings):
        jwt_secret: str
        jwt_algorithm: str = "HS256"

    # database/config.py
    class DatabaseSettings(BaseSettings):
        url: str
        pool_size: int = 5
```

### 4. Dependencies

```yaml
usage:
  - Dependency injection
  - Validation against database
  - Authentication/authorization
  - Request scoped caching

patterns:
  chain: avoid code repetition
  cache: FastAPI caches within request scope
  decouple: small, reusable functions

example: |
  async def get_current_user(
      token: str = Depends(oauth2_scheme),
      db: Session = Depends(get_db)
  ) -> User:
      user = await db.get_user_by_token(token)
      if not user:
          raise HTTPException(status_code=401)
      return user

  async def get_active_user(
      user: User = Depends(get_current_user)
  ) -> User:
      if not user.is_active:
          raise HTTPException(status_code=403)
      return user
```

### 5. Error Handling

```yaml
custom_exceptions:
  scope: module-specific
  purpose: clarity and consistency

pattern: |
  # auth/exceptions.py
  class AuthException(Exception):
      pass

  class InvalidCredentials(AuthException):
      pass

  class TokenExpired(AuthException):
      pass

  # auth/router.py
  @router.post("/login")
  async def login(credentials: LoginSchema):
      try:
          return await auth_service.login(credentials)
      except InvalidCredentials:
          raise HTTPException(
              status_code=401,
              detail="Invalid credentials"
          )

exception_handlers: |
  @app.exception_handler(AuthException)
  async def auth_exception_handler(request, exc):
      return JSONResponse(
          status_code=401,
          content={"detail": str(exc)}
      )
```

### 6. Database

```yaml
naming:
  establish: upfront conventions
  consistency: across all models

migrations:
  tool: Alembic
  naming: explicit naming rules

design:
  approach: SQL-first
  then: add Pydantic models

patterns: |
  # Use async database drivers
  from sqlalchemy.ext.asyncio import AsyncSession

  async def get_user(db: AsyncSession, user_id: int):
      result = await db.execute(
          select(User).where(User.id == user_id)
      )
      return result.scalar_one_or_none()
```

### 7. API Design

```yaml
routing:
  prefix: meaningful module prefix
  tags: for documentation grouping

responses:
  schema: always define response models
  status_codes: document all possible codes

example: |
  router = APIRouter(
      prefix="/users",
      tags=["users"]
  )

  @router.get(
      "/{user_id}",
      response_model=UserResponse,
      responses={
          404: {"model": ErrorResponse}
      }
  )
  async def get_user(user_id: int):
      ...
```

### 8. Testing

```yaml
setup:
  async_client: from day one
  structure: mirror module layout

patterns: |
  import pytest
  from httpx import AsyncClient

  @pytest.fixture
  async def client():
      async with AsyncClient(app=app, base_url="http://test") as ac:
          yield ac

  @pytest.mark.asyncio
  async def test_get_user(client):
      response = await client.get("/users/1")
      assert response.status_code == 200
```

## Application

When writing FastAPI code:

1. **Always** use domain-based project structure
2. **Always** use `async def` for I/O operations
3. **Prefer** Pydantic for all validation
4. **Use** dependencies for reusable logic
5. **Define** module-specific exceptions
6. **Document** API with response models
7. **Test** with async client
8. **Use** Ruff for code quality
