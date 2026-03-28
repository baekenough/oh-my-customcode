---
name: claude-code-bible
description: Fetch Claude Code official documentation. Use when updating local reference docs or checking official spec.
scope: core
disable-model-invocation: true
user-invocable: false
---

# Claude Code Bible

Official documentation reference management for Claude Code.

## Purpose

Maintain up-to-date local copies of Claude Code official documentation.

## Commands

### /claude-code-bible update

Fetch the latest documentation from code.claude.com.

**What it does:**
- Fetches `https://code.claude.com/docs/llms.txt`
- Extracts all documentation URLs from the llms.txt content
- Downloads each documentation page and saves as markdown
- Writes a timestamp file for cache tracking
- Respects a 24-hour cache (skip if fresh, unless `--force` used)

**Usage:**
```bash
# Fetch latest docs (skip if cached < 24h)
node .claude/skills/claude-code-bible/scripts/fetch-docs.js

# Force update even if cache is fresh
node .claude/skills/claude-code-bible/scripts/fetch-docs.js --force

# Custom output directory
node .claude/skills/claude-code-bible/scripts/fetch-docs.js --output /path/to/output
```

**Default output location:**
```
~/.claude/references/claude-code/
├── llms.txt              # Master index
├── last-updated.txt      # ISO timestamp
├── <doc-name>.md         # Individual doc pages
└── ...
```

**Exit codes:**
- `0`: Success (or cache is fresh)
- `1`: Fatal error

## Implementation Notes

### Fetch Script (fetch-docs.js)

**Features:**
- Uses only Node.js built-in modules (https, fs, path)
- Handles HTTP redirects (3xx responses)
- Respects server with 200ms delay between requests
- 24-hour cache to avoid unnecessary fetches
- Comprehensive error reporting

**Cache behavior:**
- Checks `last-updated.txt` timestamp
- Skips fetch if < 24 hours old (unless --force)
- Always updates timestamp on successful fetch

**Error handling:**
- Reports HTTP errors with status codes
- Continues on individual page failures
- Prints summary of successes and failures

## Integration with Other Skills

### update-docs
- Should update local docs first: `/claude-code-bible update`

### dev-review
- Can reference official docs for best practices

## Benefits

1. **Up-to-date**: Always have latest documentation locally
2. **Offline access**: Work with docs even without internet
3. **Learning**: Reference official patterns when creating new components

## Notes

- The fetch script is production-ready and can be used immediately
- Consider running `/claude-code-bible update` weekly to stay current
