# [SHOULD] Wiki Sync Rules

> **Priority**: SHOULD | **ID**: R022

## Core Rule

When agents, skills, rules, or guides are created or modified, corresponding wiki pages SHOULD be updated to keep the knowledge base current. The wiki is the project's compiled knowledge — stale wikis degrade team and LLM onboarding speed.

## When to Sync

| Change Type | Wiki Action |
|-------------|-------------|
| New agent created | Create wiki/agents/{name}.md |
| Agent modified | Update wiki/agents/{name}.md |
| New skill created | Create wiki/skills/{name}.md |
| Skill modified | Update wiki/skills/{name}.md |
| Rule created/modified | Update wiki/rules/r{nnn}.md |
| Guide created/modified | Update wiki/guides/{name}.md |
| Architecture change | Update wiki/architecture/ pages |
| Multiple changes | Run `/omcustom:wiki` for full update |

## How to Sync

| Method | When |
|--------|------|
| `/omcustom:wiki ingest <path>` | Single file/directory changed |
| `/omcustom:wiki` | Multiple files changed or periodic refresh |
| `/omcustom:wiki lint` | After major structural changes |
| Automatic (CI) | `.github/workflows/wiki-sync.yml` checks on PR |

## Delegation

All wiki writes MUST go through the `wiki-curator` agent (R010). The orchestrator reads wiki pages freely but never writes them directly.

```
Orchestrator
├── Detects source change
├── Delegates to wiki-curator
│   ├── Reads source file
│   ├── Creates/updates wiki page
│   ├── Updates cross-references
│   └── Updates index.md
└── Verifies via wiki lint
```

## Integration

| Rule | Interaction |
|------|-------------|
| R010 | Wiki writes delegated to wiki-curator agent |
| R017 | Wiki sync added to sauron verification Phase 3 |
| R020 | Wiki-dependent tasks verify wiki is current before [Done] |
| R006 | Wiki pages follow same separation of concerns as source |
| R021 | SHOULD priority — advisory enforcement, CI check |

## CI Enforcement

`.github/workflows/wiki-sync.yml` checks for missing wiki pages on every PR. Missing pages cause CI failure with guidance to run `/omcustom:wiki`.

## Self-Check

Before completing a session that modified agents/skills/rules/guides:
1. Were wiki pages updated for all changes?
2. Was index.md refreshed?
3. Did wiki lint pass?

If any NO → run `/omcustom:wiki ingest` for affected paths.
