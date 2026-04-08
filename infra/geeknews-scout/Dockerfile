# geeknews-scout — GeekNews RSS feed watcher
# Base: alpine:3.21 (~7MB); final image target < 50MB
# Uses gawk (not busybox awk) for match() with capture groups

FROM alpine:3.21

# Install runtime dependencies in a single layer; clean apk cache immediately
# github-cli available as 'github-cli' in Alpine 3.19+
# gawk required for robust XML parsing (match() with array capture groups)
RUN apk add --no-cache \
    bash \
    curl \
    gawk \
    github-cli \
    jq

# Create a non-root user for security
RUN addgroup -S scout && adduser -S scout -G scout

WORKDIR /app

COPY check-feed.sh ./check-feed.sh
RUN chmod +x ./check-feed.sh

USER scout

ENTRYPOINT ["/app/check-feed.sh"]
