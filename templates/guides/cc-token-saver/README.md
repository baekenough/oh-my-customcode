# cc-token-saver Integration Guide

> **Source**: https://github.com/ww-w-ai/cc-token-saver (Apache-2.0)
> **Strategy**: External plugin — keep as plugin, no internalization

## Installation

```bash
claude plugin marketplace add ww-w-ai/cc-token-saver
claude plugin install cc-token-saver
```

## Feature Overview

| Feature | Description |
|---------|-------------|
| Token Guardian | Detects 1h prompt cache TTL idle expiry and warns before cache invalidates |
| Smart Session Architecture | Auto-injects SubTask delegation patterns into context |
| `/continue` | Zero-cost context restore after session pause |
| Live Status Line | Real-time token/cost status bar |
| `/usage-view` | Cost dashboard showing per-session and cumulative spend |
| `/report-limit` | Community-sourced rate limit reporting |

## Conflict Resolution with oh-my-customcode

### Live Status Line (R012 Priority)

oh-my-customcode runs its own statusline via `.claude/statusline.sh` (R012). Two simultaneous status bars create visual clutter.

**Resolution**: R012 statusline has priority. Disable cc-token-saver's Live Status Line:

```bash
# In cc-token-saver config (if supported), or ignore its statusline output
# oh-my-customcode statusline is configured in .claude/settings.local.json
```

The R012 statusline already covers: Cost, Rate Limit %, Weekly Limit %, Context %. cc-token-saver's Live Status Line is redundant when R012 is active.

### SubTask Delegation (R009/R010/R018 Priority)

cc-token-saver's Smart Session Architecture auto-injects SubTask delegation patterns. oh-my-customcode has its own delegation rules (R010) and parallel execution rules (R009/R018).

**Resolution**: Internal rules always take precedence (R010 External Skills vs Internal Rules).

| cc-token-saver suggests | oh-my-customcode rule |
|-------------------------|----------------------|
| Use SubTask for delegation | Agent tool via routing skills (R010) |
| Sequential delegation pattern | Parallel when independent (R009) |
| Generic subtask agent | Specialized agent by domain (R010) |

Ignore cc-token-saver's SubTask suggestions when they conflict with R009/R010/R018.

### Token Guardian ↔ R013 context-budget-advisor.sh (Coexistence)

These two components solve different problems and can run simultaneously:

| Component | Trigger | Scope |
|-----------|---------|-------|
| `context-budget-advisor.sh` (R013) | Context usage % approaching threshold | In-session budget management |
| Token Guardian (cc-token-saver) | 1h cache TTL idle detection | Cross-session cache cost |

**No conflict** — Token Guardian fires on idle time, R013 fires on context percentage. Both warnings are useful.

## Usage Scenarios

### `/continue` — Zero-cost context restore

Use after interrupting and resuming a session. Restores context without re-spending tokens.

```
/continue
```

Best for: returning to a paused task, recovering from accidental session close.

### `/usage-view` — Cost dashboard

```
/usage-view
```

Shows per-session and cumulative cost. Useful for budget tracking across long sessions.

### `/report-limit` — Community rate limit data

```
/report-limit
```

Reports your current rate limit hit to the community pool and shows aggregate rate limit data from other users. Helps gauge when limits reset.

## Integration Notes

- R013 ecomode and Token Guardian are complementary, not competing
- R012 statusline supersedes cc-token-saver's Live Status Line
- R009/R010/R018 delegation rules override cc-token-saver's SubTask patterns
- `/continue`, `/usage-view`, `/report-limit` have no conflicts with internal rules — use freely
