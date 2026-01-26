# Dockerfile Best Practices

> Source: https://docs.docker.com/develop/develop-images/dockerfile_best-practices/

## General Guidelines

### Create Ephemeral Containers

Containers should be ephemeral - can be stopped, destroyed, and rebuilt with minimal setup.

### Understand Build Context

```bash
# Entire directory sent to daemon
docker build .

# Use .dockerignore to exclude files
# .dockerignore
.git
node_modules
*.md
```

### Use Multi-Stage Builds

```dockerfile
# Build stage
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

# Runtime stage
FROM alpine:3.19
COPY --from=builder /app/myapp /usr/local/bin/
CMD ["myapp"]
```

## Dockerfile Instructions

### FROM

```dockerfile
# Pin versions
FROM ubuntu:22.04

# Use digest for reproducibility
FROM node:20@sha256:abc123...

# Use official images
FROM python:3.12-slim
```

### RUN

```dockerfile
# Combine commands
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Use BuildKit cache
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
```

### CMD vs ENTRYPOINT

```dockerfile
# CMD: Default command (can be overridden)
CMD ["python", "app.py"]

# ENTRYPOINT: Fixed command
ENTRYPOINT ["python"]
CMD ["app.py"]

# Combined
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["postgres"]
```

### COPY vs ADD

```dockerfile
# Prefer COPY (more explicit)
COPY requirements.txt .

# ADD only for tar extraction or URLs
ADD archive.tar.gz /app/
```

### EXPOSE

```dockerfile
# Documentation only
EXPOSE 8080
EXPOSE 443/tcp
```

### ENV

```dockerfile
ENV APP_HOME=/app \
    PATH=$APP_HOME/bin:$PATH

WORKDIR $APP_HOME
```

### VOLUME

```dockerfile
# Named mount point
VOLUME /data
```

### USER

```dockerfile
# Create non-root user
RUN groupadd -r app && useradd -r -g app app
USER app

# Or use existing
USER nobody
```

### WORKDIR

```dockerfile
# Always use absolute paths
WORKDIR /app
WORKDIR /app/src
```

### HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1
```

## Layer Optimization

### Order Matters

```dockerfile
# 1. Install dependencies (changes rarely)
COPY package.json package-lock.json ./
RUN npm ci

# 2. Copy source (changes often)
COPY . .

# 3. Build
RUN npm run build
```

### Combine RUN Commands

```dockerfile
# Good: Single layer
RUN apt-get update && \
    apt-get install -y python3 && \
    rm -rf /var/lib/apt/lists/*

# Bad: Multiple layers
RUN apt-get update
RUN apt-get install -y python3
RUN rm -rf /var/lib/apt/lists/*
```

## Security Best Practices

### Don't Run as Root

```dockerfile
FROM node:20

RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

COPY --chown=nodejs:nodejs . .
```

### Don't Store Secrets

```dockerfile
# Bad: Secret in image
ENV API_KEY=secret123

# Good: Pass at runtime
# docker run -e API_KEY=secret123 myapp
```

### Use Official Images

```dockerfile
# Official and verified
FROM nginx:1.25
FROM postgres:16

# Minimal images
FROM gcr.io/distroless/static
FROM alpine:3.19
```

## Example Dockerfiles

### Node.js

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Python

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --user pipenv
COPY Pipfile Pipfile.lock ./
RUN pipenv install --system --deploy

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
USER nobody
EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
```

### Go

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server

FROM scratch
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```
