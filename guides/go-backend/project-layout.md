# Standard Go Project Layout

> Source: https://github.com/golang-standards/project-layout

## Directory Structure

```
project/
├── cmd/                    # Main applications
│   ├── server/
│   │   └── main.go
│   └── worker/
│       └── main.go
├── internal/               # Private code
│   ├── handler/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── config/
├── pkg/                    # Public library code
│   └── validator/
├── api/                    # API definitions
│   ├── openapi.yaml
│   └── proto/
├── configs/                # Configuration files
│   └── config.yaml
├── scripts/                # Build scripts
│   └── build.sh
├── test/                   # Additional test data
│   └── testdata/
├── docs/                   # Documentation
├── Dockerfile
├── Makefile
├── go.mod
└── go.sum
```

## Directory Descriptions

### `/cmd`

Main applications for this project. Each application has its own subdirectory.

```go
// cmd/server/main.go
package main

import (
    "log"
    "myapp/internal/config"
    "myapp/internal/handler"
    "myapp/internal/service"
)

func main() {
    cfg, err := config.Load()
    if err != nil {
        log.Fatal(err)
    }

    svc := service.New(cfg)
    h := handler.New(svc)

    log.Fatal(h.ListenAndServe(cfg.Addr))
}
```

### `/internal`

Private application and library code. Not importable by other projects.

```
internal/
├── handler/        # HTTP/gRPC handlers
│   └── user.go
├── service/        # Business logic
│   └── user.go
├── repository/     # Data access
│   └── user.go
├── model/          # Domain models
│   └── user.go
└── config/         # Configuration
    └── config.go
```

### `/pkg`

Library code safe for external use.

```go
// pkg/validator/validator.go
package validator

func ValidateEmail(email string) bool {
    // validation logic
}
```

### `/api`

API definitions (OpenAPI/Swagger, Protocol Buffers).

```yaml
# api/openapi.yaml
openapi: "3.0.0"
info:
  title: "My API"
  version: "1.0.0"
paths:
  /users:
    get:
      summary: "List users"
```

## Common Patterns

### Application Structure

```go
// internal/app/app.go
type App struct {
    config  *config.Config
    db      *sql.DB
    cache   *redis.Client
    handler *handler.Handler
}

func New(cfg *config.Config) (*App, error) {
    db, err := sql.Open("postgres", cfg.DatabaseURL)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }

    cache := redis.NewClient(&redis.Options{
        Addr: cfg.RedisURL,
    })

    repo := repository.New(db)
    svc := service.New(repo, cache)
    h := handler.New(svc)

    return &App{
        config:  cfg,
        db:      db,
        cache:   cache,
        handler: h,
    }, nil
}

func (a *App) Run() error {
    return http.ListenAndServe(a.config.Addr, a.handler.Router())
}

func (a *App) Shutdown(ctx context.Context) error {
    if err := a.db.Close(); err != nil {
        return err
    }
    return a.cache.Close()
}
```

### Main Entry Point

```go
// cmd/server/main.go
package main

import (
    "context"
    "log/slog"
    "os"
    "os/signal"
    "syscall"

    "myapp/internal/app"
    "myapp/internal/config"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    slog.SetDefault(logger)

    cfg, err := config.Load()
    if err != nil {
        slog.Error("load config", "error", err)
        os.Exit(1)
    }

    application, err := app.New(cfg)
    if err != nil {
        slog.Error("create app", "error", err)
        os.Exit(1)
    }

    // Graceful shutdown
    ctx, stop := signal.NotifyContext(
        context.Background(),
        syscall.SIGINT, syscall.SIGTERM,
    )
    defer stop()

    go func() {
        slog.Info("starting server", "addr", cfg.Addr)
        if err := application.Run(); err != nil {
            slog.Error("server error", "error", err)
        }
    }()

    <-ctx.Done()
    slog.Info("shutting down")

    shutdownCtx, cancel := context.WithTimeout(
        context.Background(),
        30*time.Second,
    )
    defer cancel()

    if err := application.Shutdown(shutdownCtx); err != nil {
        slog.Error("shutdown error", "error", err)
    }
}
```

### Makefile

```makefile
.PHONY: build run test lint

build:
	go build -o bin/server ./cmd/server

run:
	go run ./cmd/server

test:
	go test -v -race ./...

lint:
	golangci-lint run

docker:
	docker build -t myapp .
```
