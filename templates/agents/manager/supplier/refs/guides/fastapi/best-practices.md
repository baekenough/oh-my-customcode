# FastAPI Best Practices

> Source: https://fastapi.tiangolo.com/ and community patterns

## Project Structure

Organize by domain, not by file type:

```
src/
├── auth/
│   ├── router.py       # API endpoints
│   ├── schemas.py      # Pydantic models
│   ├── models.py       # Database models
│   ├── service.py      # Business logic
│   ├── dependencies.py # Route validators
│   └── exceptions.py   # Custom exceptions
├── users/
│   └── ...
├── config.py
└── main.py
```

## Async Best Practices

### I/O-Intensive Tasks

```python
# Use async def with await for non-blocking I/O
async def fetch_user(user_id: int) -> User:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"/api/users/{user_id}")
        return User(**response.json())
```

### Sync I/O Operations

```python
# Use regular def - FastAPI offloads to threadpool
def read_config() -> dict:
    with open("config.yaml") as f:
        return yaml.safe_load(f)
```

### CPU-Intensive Tasks

```python
# Use separate worker processes
from celery import Celery

celery_app = Celery("tasks", broker="redis://localhost")

@celery_app.task
def process_data(data: dict) -> dict:
    # Heavy computation
    return result
```

### Never Do This

```python
# WRONG: Blocks event loop
async def bad_example():
    time.sleep(5)  # Never use time.sleep in async!

# CORRECT: Use asyncio.sleep
async def good_example():
    await asyncio.sleep(5)
```

## Pydantic Models

### Custom Base Model

```python
from pydantic import BaseModel
from datetime import datetime

class AppBaseModel(BaseModel):
    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UserResponse(AppBaseModel):
    id: int
    email: str
    created_at: datetime
```

### Validation

```python
from pydantic import BaseModel, EmailStr, Field, validator

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    age: int = Field(..., ge=18, le=120)

    @validator("password")
    def password_strength(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain uppercase")
        return v
```

## Dependencies

### Authentication

```python
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    user = await verify_token(token, db)
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

### Database Session

```python
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

## Error Handling

```python
# Custom exceptions
class AuthException(Exception):
    pass

class InvalidCredentials(AuthException):
    pass

# Exception handler
@app.exception_handler(AuthException)
async def auth_exception_handler(request, exc):
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc)}
    )

# In router
@router.post("/login")
async def login(credentials: LoginSchema):
    try:
        return await auth_service.login(credentials)
    except InvalidCredentials:
        raise HTTPException(status_code=401, detail="Invalid credentials")
```

## API Design

```python
from fastapi import APIRouter

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID",
    responses={
        404: {"model": ErrorResponse, "description": "User not found"}
    }
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get a specific user by their ID.

    - **user_id**: The unique identifier of the user
    """
    user = await user_service.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

## Testing

```python
import pytest
from httpx import AsyncClient
from main import app

@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/users/",
        json={"email": "test@example.com", "password": "Password123"}
    )
    assert response.status_code == 201
    assert response.json()["email"] == "test@example.com"
```
