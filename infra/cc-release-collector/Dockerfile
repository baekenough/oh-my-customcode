# cc-release-collector — Lightweight GitHub release watcher
# Base: alpine:3.21 (~7MB); final image target < 50MB

FROM alpine:3.21

# Install runtime dependencies in a single layer; clean apk cache immediately
# gh CLI is available as 'github-cli' in Alpine 3.19+
RUN apk add --no-cache \
    bash \
    curl \
    github-cli \
    jq

# Create a non-root user for security
RUN addgroup -S collector && adduser -S collector -G collector

WORKDIR /app

COPY check-releases.sh ./check-releases.sh
RUN chmod +x ./check-releases.sh

USER collector

ENTRYPOINT ["/app/check-releases.sh"]
