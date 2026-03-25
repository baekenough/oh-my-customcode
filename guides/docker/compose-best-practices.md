# Docker Compose Best Practices

> Source: https://docs.docker.com/compose/compose-file/best-practices/

## File Structure

```yaml
version: "3.8"

services:
  # Application services
  app:
    ...

  # Infrastructure services
  db:
    ...

volumes:
  # Named volumes

networks:
  # Custom networks
```

## Service Configuration

### Build Configuration

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
      args:
        - NODE_ENV=production
```

### Environment Variables

```yaml
services:
  app:
    # From file
    env_file:
      - .env
      - .env.local

    # Inline
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NODE_ENV=production
```

### Dependencies

```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
```

### Health Checks

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

### Resource Limits

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.5"
          memory: 256M
```

## Volumes

### Named Volumes

```yaml
services:
  db:
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
    driver: local
```

### Bind Mounts (Development)

```yaml
services:
  app:
    volumes:
      - ./src:/app/src:ro
      - ./config:/app/config:ro
```

## Networks

### Custom Networks

```yaml
services:
  app:
    networks:
      - frontend
      - backend

  db:
    networks:
      - backend

networks:
  frontend:
  backend:
    internal: true
```

## Multiple Environments

### Override Files

```bash
# Base configuration
docker-compose.yml

# Development overrides
docker-compose.override.yml

# Production overrides
docker-compose.prod.yml

# Usage
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

### Example: Production

```yaml
# docker-compose.prod.yml
services:
  app:
    build:
      target: production
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "1"
          memory: 1G

  db:
    restart: always
    volumes:
      - /mnt/data/postgres:/var/lib/postgresql/data
```

### Example: Development

```yaml
# docker-compose.override.yml
services:
  app:
    build:
      target: development
    volumes:
      - ./src:/app/src
    environment:
      - DEBUG=true
    ports:
      - "3000:3000"
      - "9229:9229"  # debugger
```

## Complete Example

```yaml
version: "3.8"

services:
  app:
    build:
      context: .
      target: production
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 1G
    networks:
      - frontend
      - backend

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - backend

  nginx:
    image: nginx:1.25-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app
    networks:
      - frontend

volumes:
  postgres_data:
  redis_data:

networks:
  frontend:
  backend:
    internal: true
```
