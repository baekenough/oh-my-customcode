# Browser Automation Patterns for AI Agents

## Overview

Reference guide for AI-controlled browser automation patterns, focusing on integration with Claude Code and MCP-based browser tools.

## Patterns

### 1. MCP-based Browser Control (Recommended)

Use MCP tools (`mcp__claude-in-chrome__*` or `mcp__playwright__*`) for browser interaction:

```
Agent → MCP tool call → Browser extension/Playwright → Page interaction
```

**Advantages**: Native integration, no external dependencies, permission-controlled.

### 2. Cookie-Based Authentication

For testing authenticated flows, import cookies from a real browser session:

```bash
# Export cookies from browser (DevTools → Application → Cookies)
# Import into Playwright context for authenticated testing
```

**Use case**: QA testing of authenticated pages without re-implementing login flows.

### 3. Anti-Bot Stealth Patterns

When automating against sites with bot detection:
- Use realistic viewport sizes and user agents
- Add human-like delays between actions
- Randomize mouse movement patterns
- Respect robots.txt and rate limits

**Caution**: Only use for authorized testing on your own applications.

### 4. Cross-AI Vendor Orchestration

Multiple AI agents can share browser sessions via:
- Shared MCP server connection
- ngrok tunnels for remote access (scoped tokens for security)
- Agent Teams (R018) for coordination

## Tools Available in oh-my-customcode

| Tool | Scope | Configuration |
|------|-------|---------------|
| `mcp__claude-in-chrome__*` | Chrome DevTools Protocol | MCP server in settings |
| `mcp__playwright__*` | Playwright automation | MCP server in settings |
| `playwright-compress` | Output compression (Layer 4) | PostToolUse hook |

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Credential exposure | Never hardcode credentials; use env vars or cookie import |
| External data transmission | R001 compliance — no PII to external services |
| Rate limiting | Respect target site limits; implement backoff |
| Scope creep | Only automate your own applications or authorized targets |

## References

- [garrytan/gstack](https://github.com/garrytan/gstack) — /browse, /pair-agent patterns
- [playwright.dev](https://playwright.dev) — Official Playwright documentation
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — CDP reference
