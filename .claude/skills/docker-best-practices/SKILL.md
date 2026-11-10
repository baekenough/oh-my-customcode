---
name: docker-best-practices
description: Docker patterns for optimized containerization
scope: core
user-invocable: false
---

## Purpose

Apply Docker patterns for building optimized and secure container images.

## Rules

### 1. Layer Optimization

```yaml
principles:
  - Combine related RUN commands
  - Sort multi-line arguments alphabetically
  - Clean up in same layer

patterns: |
  # GOOD: Single layer, clean cache
  RUN apt-get update && apt-get install -y \
      curl \
      git \
      vim \
      && rm -rf /var/lib/apt/lists/*

  # BAD: Multiple layers, cache remains
  RUN apt-get update
  RUN apt-get install -y curl
  RUN apt-get install -y git
```

### 2. Multi-Stage Builds

```yaml
purpose:
  - Reduce final image size
  - Separate build and runtime dependencies
  - Security (no build tools in production)

pattern: |
  # Build stage
  FROM golang:1.27 AS builder
  WORKDIR /app
  COPY go.mod go.sum ./
  RUN go mod download
  COPY . .
  RUN CGO_ENABLED=0 go build -o /app/server ./cmd/server

  # Runtime stage
  FROM gcr.io/distroless/static:nonroot
  COPY --from=builder /app/server /server
  USER nonroot:nonroot
  ENTRYPOINT ["/server"]
```

### 3. Security

```yaml
principles:
  - Run as non-root user
  - Pin base image versions
  - Use minimal base images
  - Don't store secrets in images

patterns: |
  # Pin version with digest (example digest of node:26-slim, resolved 2026-11-10;
  # resolve your own with: docker buildx imagetools inspect node:26-slim)
  FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072

  # Create non-root user
  RUN groupadd -r appgroup && useradd -r -g appgroup appuser
  USER appuser

  # Use secrets mount (BuildKit)
  RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
      npm install

  # .dockerignore for secrets
  # .env
  # *.pem
  # credentials.json
```

### 4. Image Size Reduction

```yaml
strategies:
  - Use slim/alpine base images
  - Remove build dependencies
  - Use .dockerignore
  - Multi-stage builds

minimal_bases:
  distroless: "gcr.io/distroless/static"
  alpine: "alpine:3.24"
  slim: "debian:12-slim"

patterns: |
  # Alpine for size
  FROM python:3.15-alpine
  RUN apk add --no-cache gcc musl-dev

  # Distroless for security (build in a full image, copy only the app)
  FROM node:26-slim AS builder
  WORKDIR /app
  COPY . .
  RUN npm ci --omit=dev

  FROM gcr.io/distroless/nodejs26-debian13
  COPY --from=builder /app /app
```

### 5. Cache Optimization

```yaml
principles:
  - Order from least to most frequently changing
  - Copy dependency files first
  - Use BuildKit cache mounts

patterns: |
  # Copy dependency files first
  COPY package.json package-lock.json ./
  RUN npm ci

  # Then copy source (changes frequently)
  COPY . .
  RUN npm run build

  # BuildKit cache mount
  RUN --mount=type=cache,target=/root/.cache/pip \
      pip install -r requirements.txt
```

### 6. ENTRYPOINT vs CMD

```yaml
entrypoint:
  purpose: Main executable
  form: exec form ["executable"]

cmd:
  purpose: Default arguments
  form: exec form ["arg1", "arg2"]

patterns: |
  # Fixed command with variable args
  ENTRYPOINT ["python", "app.py"]
  CMD ["--port", "8080"]

  # docker run myapp --port 3000
  # Executes: python app.py --port 3000

  # Flexible command
  CMD ["python", "app.py"]

  # docker run myapp bash
  # Executes: bash
```

### 7. Health Checks

```yaml
purpose: Container health monitoring
interval: how often to check
timeout: max time for check
retries: failures before unhealthy

pattern: |
  HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
      CMD curl -f http://localhost:8080/health || exit 1
```

### 8. Docker Compose

```yaml
best_practices:
  - Use named volumes
  - Define networks explicitly
  - Use environment files
  - Set resource limits

pattern: |
  services:
    app:
      build:
        context: .
        target: production
      environment:
        - DATABASE_URL
      env_file:
        - .env
      ports:
        - "8080:8080"
      depends_on:
        db:
          condition: service_healthy
      deploy:
        resources:
          limits:
            cpus: "1"
            memory: 512M
      networks:
        - backend

    db:
      image: postgres:16-alpine
      volumes:
        - postgres_data:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U postgres"]
        interval: 10s
        timeout: 5s
        retries: 5
      networks:
        - backend

  volumes:
    postgres_data:

  networks:
    backend:
```

### 9. Common Patterns by Language

```yaml
nodejs: |
  FROM node:26-slim AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev

  FROM gcr.io/distroless/nodejs26-debian13
  WORKDIR /app
  COPY --from=builder /app/node_modules ./node_modules
  COPY . .
  CMD ["server.js"]

python: |
  FROM python:3.15-slim AS builder
  RUN python -m venv /opt/venv
  ENV PATH=/opt/venv/bin:$PATH
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt

  FROM python:3.15-slim
  WORKDIR /app
  COPY --from=builder /opt/venv /opt/venv
  ENV PATH=/opt/venv/bin:$PATH
  COPY . .
  USER nobody
  CMD ["python", "app.py"]

go: |
  FROM golang:1.27 AS builder
  WORKDIR /app
  COPY go.* ./
  RUN go mod download
  COPY . .
  RUN CGO_ENABLED=0 go build -o /server

  FROM scratch
  COPY --from=builder /server /server
  ENTRYPOINT ["/server"]
```

## Application

When writing Dockerfiles:

1. **Always** use multi-stage builds
2. **Always** run as non-root user
3. **Always** pin base image versions
4. **Prefer** minimal base images
5. **Order** layers for cache efficiency
6. **Clean** package caches in same layer
7. **Use** .dockerignore
8. **Add** health checks
