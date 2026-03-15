---
name: go-backend-best-practices
description: Go backend patterns from Uber style and standard layout
scope: core
user-invocable: false
---

## Purpose

Apply Go backend patterns for building production-ready services.

## Rules

### 1. Project Structure (Standard Layout)

```yaml
layout: "cmd/{server/main.go} + internal/{handler/,service/,repository/,model/} + pkg/{shared/} + api/{openapi.yaml} + configs/ + scripts/"

directories:
  cmd: Main applications (one per binary)
  internal: Private application code
  pkg: Library code safe for external use
  api: API definitions (OpenAPI, protobuf)
  configs: Configuration files
  scripts: Build and CI scripts
```

Reference: guides/go-backend/project-layout.md

### 2. Error Handling (Uber Style)

```yaml
principles:
  - Wrap errors with context using %w
  - Handle errors once (don't log AND return)
  - Use sentinel errors for specific conditions
  - Name error variables with Err prefix

patterns:
  sentinel: "var ErrNotFound = errors.New(\"not found\")"
  wrapping: "fmt.Errorf(\"getUser %s: %w\", id, err)"
  checking: "errors.Is(err, ErrNotFound)"
```

Reference: guides/go-backend/uber-style.md

### 3. Concurrency (Uber Style)

```yaml
channels:
  size: "Use 0 (unbuffered) or 1 only"
  larger: "Requires careful review"

goroutines:
  never: fire-and-forget
  always: wait for completion or manage lifecycle
  patterns: "sync.WaitGroup + error channel for parallel work; context.Context for cancellation"
```

Reference: guides/go-backend/uber-style.md

### 4. HTTP Server

```yaml
structure:
  handler: HTTP layer (request/response)
  service: Business logic
  repository: Data access

patterns:
  dependency_injection: "Handler struct with service field, constructor NewXxxHandler()"
  router: "chi.NewRouter() with middleware (Logger, Recoverer) and versioned routes"
  error_mapping: "errors.Is() to map domain errors to HTTP status codes"
```

Reference: guides/go-backend/uber-style.md

### 5. Dependency Injection

```yaml
approach: constructor injection
avoid: global variables
pattern: "Struct with dependencies as fields, New* constructor functions, wire up in main()"
```

Reference: guides/go-backend/uber-style.md

### 6. Configuration

```yaml
approach:
  - Use environment variables
  - Validate at startup
  - Group related settings
pattern: "Config struct with nested typed configs, env struct tags, Parse at startup"
```

Reference: guides/go-backend/uber-style.md

### 7. Testing

```yaml
patterns:
  table_driven: for comprehensive coverage
  interfaces: for mocking
  parallel: for speed
  tools: "gomock for mocks, cmp.Diff for assertions"
```

Reference: guides/go-backend/uber-style.md

### 8. Performance (Uber Style)

```yaml
guidelines:
  - Use strconv over fmt for conversions
  - Pre-allocate slices with known capacity
  - Avoid repeated string-to-byte conversions
  - Copy slices/maps at boundaries
```

Reference: guides/go-backend/uber-style.md

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
