---
name: go-backend-best-practices
description: Go backend patterns from Uber style and standard layout
user-invocable: false
---

## Purpose

Apply Go backend patterns for building production-ready services.

## Rules

### 1. Project Structure (Standard Layout)

```yaml
layout: |
  project/
  ├── cmd/
  │   └── server/
  │       └── main.go
  ├── internal/
  │   ├── handler/
  │   ├── service/
  │   ├── repository/
  │   └── model/
  ├── pkg/
  │   └── shared/
  ├── api/
  │   └── openapi.yaml
  ├── configs/
  ├── scripts/
  ├── Dockerfile
  ├── Makefile
  └── go.mod

directories:
  cmd: Main applications (one per binary)
  internal: Private application code
  pkg: Library code safe for external use
  api: API definitions (OpenAPI, protobuf)
  configs: Configuration files
  scripts: Build and CI scripts
```

### 2. Error Handling (Uber Style)

```yaml
principles:
  - Wrap errors with context using %w
  - Handle errors once (don't log AND return)
  - Use sentinel errors for specific conditions
  - Name error variables with Err prefix

patterns: |
  // Sentinel errors
  var (
      ErrNotFound = errors.New("not found")
      ErrInvalidInput = errors.New("invalid input")
  )

  // Wrap with context
  func getUser(id string) (*User, error) {
      user, err := db.FindUser(id)
      if err != nil {
          return nil, fmt.Errorf("getUser %s: %w", id, err)
      }
      return user, nil
  }

  // Check specific errors
  if errors.Is(err, ErrNotFound) {
      return http.StatusNotFound
  }
```

### 3. Concurrency (Uber Style)

```yaml
channels:
  size: "Use 0 (unbuffered) or 1 only"
  larger: "Requires careful review"

goroutines:
  never: fire-and-forget
  always: wait for completion or manage lifecycle

patterns: |
  // Wait group for goroutines
  func process(items []Item) error {
      var wg sync.WaitGroup
      errCh := make(chan error, 1)

      for _, item := range items {
          wg.Add(1)
          go func(item Item) {
              defer wg.Done()
              if err := processItem(item); err != nil {
                  select {
                  case errCh <- err:
                  default:
                  }
              }
          }(item)
      }

      wg.Wait()
      close(errCh)
      return <-errCh
  }

  // Context for cancellation
  func longRunningTask(ctx context.Context) error {
      for {
          select {
          case <-ctx.Done():
              return ctx.Err()
          default:
              // do work
          }
      }
  }
```

### 4. HTTP Server

```yaml
structure:
  handler: HTTP layer (request/response)
  service: Business logic
  repository: Data access

patterns: |
  // Handler with dependency injection
  type UserHandler struct {
      service UserService
  }

  func NewUserHandler(s UserService) *UserHandler {
      return &UserHandler{service: s}
  }

  func (h *UserHandler) GetUser(w http.ResponseWriter, r *http.Request) {
      id := chi.URLParam(r, "id")

      user, err := h.service.GetUser(r.Context(), id)
      if err != nil {
          if errors.Is(err, ErrNotFound) {
              http.Error(w, "user not found", http.StatusNotFound)
              return
          }
          http.Error(w, "internal error", http.StatusInternalServerError)
          return
      }

      json.NewEncoder(w).Encode(user)
  }

  // Router setup
  func NewRouter(h *UserHandler) *chi.Mux {
      r := chi.NewRouter()
      r.Use(middleware.Logger)
      r.Use(middleware.Recoverer)

      r.Route("/api/v1", func(r chi.Router) {
          r.Get("/users/{id}", h.GetUser)
          r.Post("/users", h.CreateUser)
      })

      return r
  }
```

### 5. Dependency Injection

```yaml
approach: constructor injection
avoid: global variables

patterns: |
  // Service with dependencies
  type UserService struct {
      repo   UserRepository
      cache  Cache
      logger *slog.Logger
  }

  func NewUserService(
      repo UserRepository,
      cache Cache,
      logger *slog.Logger,
  ) *UserService {
      return &UserService{
          repo:   repo,
          cache:  cache,
          logger: logger,
      }
  }

  // Wire up in main
  func main() {
      logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
      db := database.New(cfg.DatabaseURL)
      cache := redis.New(cfg.RedisURL)

      repo := repository.NewUserRepository(db)
      service := service.NewUserService(repo, cache, logger)
      handler := handler.NewUserHandler(service)

      router := handler.NewRouter(handler)
      http.ListenAndServe(":8080", router)
  }
```

### 6. Configuration

```yaml
approach:
  - Use environment variables
  - Validate at startup
  - Group related settings

patterns: |
  type Config struct {
      Server   ServerConfig
      Database DatabaseConfig
      Redis    RedisConfig
  }

  type ServerConfig struct {
      Host         string        `env:"SERVER_HOST" envDefault:"0.0.0.0"`
      Port         int           `env:"SERVER_PORT" envDefault:"8080"`
      ReadTimeout  time.Duration `env:"SERVER_READ_TIMEOUT" envDefault:"5s"`
      WriteTimeout time.Duration `env:"SERVER_WRITE_TIMEOUT" envDefault:"10s"`
  }

  func LoadConfig() (*Config, error) {
      var cfg Config
      if err := env.Parse(&cfg); err != nil {
          return nil, fmt.Errorf("parse config: %w", err)
      }
      return &cfg, nil
  }
```

### 7. Testing

```yaml
patterns:
  table_driven: for comprehensive coverage
  interfaces: for mocking
  parallel: for speed

example: |
  func TestUserService_GetUser(t *testing.T) {
      tests := []struct {
          name    string
          userID  string
          mock    func(*MockRepository)
          want    *User
          wantErr error
      }{
          {
              name:   "success",
              userID: "123",
              mock: func(m *MockRepository) {
                  m.EXPECT().FindByID("123").Return(&User{ID: "123"}, nil)
              },
              want: &User{ID: "123"},
          },
          {
              name:   "not found",
              userID: "999",
              mock: func(m *MockRepository) {
                  m.EXPECT().FindByID("999").Return(nil, ErrNotFound)
              },
              wantErr: ErrNotFound,
          },
      }

      for _, tt := range tests {
          t.Run(tt.name, func(t *testing.T) {
              t.Parallel()
              ctrl := gomock.NewController(t)
              repo := NewMockRepository(ctrl)
              tt.mock(repo)

              svc := NewUserService(repo, nil, slog.Default())
              got, err := svc.GetUser(context.Background(), tt.userID)

              if !errors.Is(err, tt.wantErr) {
                  t.Errorf("got error %v, want %v", err, tt.wantErr)
              }
              if diff := cmp.Diff(tt.want, got); diff != "" {
                  t.Errorf("mismatch (-want +got):\n%s", diff)
              }
          })
      }
  }
```

### 8. Performance (Uber Style)

```yaml
guidelines:
  - Use strconv over fmt for conversions
  - Pre-allocate slices with known capacity
  - Avoid repeated string-to-byte conversions
  - Copy slices/maps at boundaries

patterns: |
  // Pre-allocate
  items := make([]Item, 0, len(input))

  // strconv for conversions
  s := strconv.Itoa(n) // not fmt.Sprintf("%d", n)

  // Copy at boundaries
  func (s *Store) GetItems() []Item {
      s.mu.RLock()
      defer s.mu.RUnlock()
      items := make([]Item, len(s.items))
      copy(items, s.items)
      return items
  }
```

## Application

When writing Go backend code:

1. **Always** use standard project layout
2. **Always** wrap errors with context
3. **Never** fire-and-forget goroutines
4. **Use** constructor injection
5. **Use** table-driven tests
6. **Handle** errors once
7. **Copy** data at boundaries
8. **Validate** config at startup
