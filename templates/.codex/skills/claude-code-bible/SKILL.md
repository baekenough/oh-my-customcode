---
name: claude-code-bible
description: Fetch and verify Codex official documentation from OpenAI canonical sources.
disable-model-invocation: true
---

# Codex Docs Bible

Official Codex documentation reference management for Codex-native projects.

## Compatibility Note

The command/skill name `claude-code-bible` is kept for backward compatibility.
Its source policy is Codex-only.

## Purpose

Maintain up-to-date local copies of Codex documentation and validate agent/skill templates against the expected Codex-native conventions.

## Canonical Source Policy

Primary documentation sources:

- `https://developers.openai.com/codex/`
- `https://developers.openai.com/codex/cli`
- `https://developers.openai.com/codex/ide`
- `https://developers.openai.com/codex/cloud`
- `https://developers.openai.com/codex/cloud/internet-access`
- `https://developers.openai.com/codex/changelog`

Fallback behavior:

- Each source has an explicit fallback URL chain in `fetch-docs.js`.
- If a primary URL fails, the script tries fallback URLs in order.
- Fetch status is written to `fetch-report.json` for auditability.

## Commands

### `/claude-code-bible update`

Fetch Codex docs snapshots from the source policy.

**What it does:**

- Applies fixed canonical source policy from script
- Fetches pages with redirect support and timeouts
- Stores snapshots as HTML files
- Writes `source-policy.json` and `fetch-report.json`
- Writes `last-updated.txt` for 24-hour cache checks

**Usage:**

```bash
# Fetch latest docs (skip if cache < 24h)
node .codex/skills/claude-code-bible/scripts/fetch-docs.js

# Force fetch regardless of cache
node .codex/skills/claude-code-bible/scripts/fetch-docs.js --force

# Use custom output directory
node .codex/skills/claude-code-bible/scripts/fetch-docs.js --output /path/to/output
```

**Default output location:**

```text
~/.codex/references/codex-docs/
├── codex-overview.html
├── codex-cli.html
├── codex-ide.html
├── codex-cloud.html
├── codex-cloud-internet.html
├── codex-changelog.html
├── source-policy.json
├── fetch-report.json
└── last-updated.txt
```

### `/claude-code-bible verify`

Validate Codex templates against Codex-native conventions.

**Verification baseline:**

1. **Agent frontmatter** includes `name`, `description`, `model`, `tools`.
2. **Skill frontmatter** includes `name`, `description`.
3. **Model profile policy** uses `reasoning | balanced | fast`.
4. **Path policy** uses `.codex/` and `AGENTS.md` references.

## Integration

- `create-agent`: run verify for new/updated agent output.
- `update-docs`: refresh docs first, then run verify.
- `sauron-watch`: include spec-alignment checks in full audit mode.

## Notes

- Fetch is resilient: partial failures are reported without losing successful snapshots.
- If all sources fail, fetch exits with non-zero status.
- Recommended cadence: run weekly or before release hardening.
