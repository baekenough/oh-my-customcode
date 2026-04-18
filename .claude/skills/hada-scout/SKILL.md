---
name: hada-scout
description: hada.io RSS feed monitoring with LLM pre-scout filtering for oh-my-customcode relevance
scope: core
version: 2.0.0
user-invocable: true
argument-hint: "[--limit N] [--threshold N]"
---

# hada-scout

3-phase in-session pipeline that monitors hada.io (via feedburner RSS) for relevant articles,
uses a haiku LLM batch to pre-score relevance, and dispatches full `/scout` analysis only on
high-scoring candidates.

## Purpose

Replace the v1.0 keyword-regex approach with context-aware LLM pre-scoring. Haiku evaluates
all feed titles in a single batch call, reducing false positives from ~30-40% to ~5-10% and
eliminating the external CronJob dependency for user-invoked runs.

## Architecture: 3-Phase In-Session Pipeline

### Phase 1 — Fetch & Parse

1. WebFetch the hada.io RSS feed (`https://feeds.feedburner.com/geeknews-feed`)
2. Parse all items: title, URL, publication date
3. Default: latest 50 items (configurable via `--limit` or `HADA_SCOUT_LIMIT`)

### Phase 2 — Pre-Scout (haiku batch)

1. Spawn 1 haiku agent with ALL item titles as a single batch input
2. Agent evaluates each title against oh-my-customcode's domain (see prompt template below)
3. Returns relevance score (0–100) and a 1-line reason for each item
4. Threshold: ≥ 60 passes to Phase 3 (configurable via `--threshold` or `HADA_SCOUT_THRESHOLD`)
5. Cost: ~$0.01–0.05 for 50 items

### Phase 3 — Scout Dispatch

1. Dedup: check existing `hada-scout` labeled issues via `gh issue list --label hada-scout`
2. For each passing item (max 5 per run, configurable via `MAX_SCOUT_PER_RUN`):
   - Run full `/scout` analysis via Skill tool invocation
   - Scout creates GitHub issue with verdict label on `baekenough/oh-my-customcode`
   - Add `hada-scout` label to the created issue
3. Dispatch up to 4 scouts in parallel per R009

## Pre-Scout Prompt Template

The haiku agent receives the following system prompt:

```
You are a relevance filter for the oh-my-customcode project — an AI agent harness/orchestration
system built on Claude Code CLI with 44 agents, 74 skills.

Project domains (HIGH relevance):
- AI agent orchestration, multi-agent systems, agent design patterns
- Harness, benchmark, evaluation frameworks for AI agents
- Claude Code, Anthropic ecosystem, MCP protocol
- Code review automation, development workflow automation
- Agent sandbox, isolation, security patterns
- LLM-assisted development tools and methodologies

Project domains (MEDIUM relevance):
- General AI/ML tooling that could be adapted for agent workflows
- DevOps automation patterns applicable to agent infrastructure
- New programming paradigms for AI-assisted development

NOT relevant:
- Pure frontend/UI frameworks without agent connection
- Business/management topics
- Hardware, networking, non-AI infrastructure
- Social media, marketing tools

For each item below, return: score (0-100) | reason (1 line)

Items:
{numbered_item_list}
```

## Display Format

```
[hada-scout] Scanning hada.io feed...
├── Phase 1: Fetched {n} items
├── Phase 2: Pre-scout → {passed}/{total} items passed (threshold: {t}%)
│   ├── ✓ {title1} (score: {s1}%)
│   ├── ✓ {title2} (score: {s2}%)
│   └── ✗ {title3} (score: {s3}%) — skipped
├── Phase 3: Scout dispatch ({n} items, max 5)
│   ├── [1] /scout {url1} → {verdict}
│   └── [2] /scout {url2} → {verdict}
└── [Done] {created}/{dispatched} issues created
```

## Label Scheme

| Label | Purpose |
|-------|---------|
| `hada-scout` | Source identification — all hada-scout created issues |
| `scout:internalize` | /scout verdict: adopt into project |
| `scout:integrate` | /scout verdict: use as external dependency |
| `scout:skip` | /scout verdict: not relevant |

## Cost Controls

| Stage | Model | Estimated Cost |
|-------|-------|----------------|
| Pre-scout (Phase 2) | haiku | ~$0.01–0.05 per run (50 items) |
| Full scout (Phase 3) | sonnet | ~$0.5–1.5 per item, max 5 per run |
| Total max per invocation | — | ~$8 |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FEED_URL` | `https://feeds.feedburner.com/geeknews-feed` | RSS feed URL |
| `HADA_SCOUT_THRESHOLD` | `60` | Pre-scout score threshold (0–100) |
| `HADA_SCOUT_LIMIT` | `50` | Max feed items to fetch and score |
| `MAX_SCOUT_PER_RUN` | `5` | Max /scout executions per invocation |
| `GH_TOKEN` | (required) | GitHub PAT for issue creation and dedup |

## Integration

| Rule | How |
|------|-----|
| R009 | Phase 3 scout dispatches run in parallel (up to 4 concurrent) |
| R010 | Orchestrator manages phases; analysis delegated to haiku/sonnet agents |
| R015 | Pre-scout scores and reasons displayed before dispatching full scouts |
| scout skill | Phase 3 invokes `/scout` via Skill tool for each candidate URL |

## Differences from v1.0

| Aspect | v1.0 (keyword) | v2.0 (LLM pre-scout) |
|--------|----------------|----------------------|
| Filtering | Regex keyword match | LLM relevance scoring (haiku) |
| Invocation | External CronJob only | User-invocable `/hada-scout` + CronJob |
| Precision | Low (keyword false positives) | High (context-aware scoring) |
| Cost per scan | $0 (regex) + $2.5–7.5 (/scout) | $0.05 (pre-scout) + $2.5–7.5 (/scout) |
| False positive rate | ~30–40% | ~5–10% |
| Scope | `package` | `core` |

## Tracking

GitHub Issue #841
