# hada-scout — hada.io RSS feed watcher + /scout automation
# Base: alpine:3.21 (~7MB); final image target < 50MB
# Uses gawk (not busybox awk) for match() with capture groups

FROM alpine:3.21

# Install runtime dependencies
RUN apk add --no-cache \
    bash \
    coreutils \
    curl \
    gawk \
    github-cli \
    jq

# Create a non-root user for security
RUN addgroup -S scout && adduser -S scout -G scout

WORKDIR /app

COPY check-feed.sh ./check-feed.sh
COPY scout-runner.sh ./scout-runner.sh
RUN chmod +x ./check-feed.sh ./scout-runner.sh

USER scout

# Default entrypoint runs check-feed.sh (Layer 1)
# For Layer 2, override: docker run ... /app/scout-runner.sh
ENTRYPOINT ["/app/check-feed.sh"]
