---
title: "Profiles Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/profiles/manifest-install.md
related:
  - [[profiles-manifest-install]]
  - [[analysis]]
  - [[adaptive-harness]]
  - [[mgr-creator]]
---

# Profiles Guide

Reference documentation for profile-based installation of oh-my-customcode assets. Profiles allow selecting a focused subset of agents, skills, and guides at install time to reduce onboarding cost and context overhead.

## Contents

| File | Description |
|------|-------------|
| [manifest-install.md](../profiles/manifest-install.md) | `--profile` flag guide — 5 built-in profiles, manifest vs plugin profile distinction, include pattern reference |

## Built-in Profiles

| Profile | Description | Recommended For |
|---------|-------------|-----------------|
| `minimal` | Core SW Engineer + Manager agents only | Learning, experimentation, lightweight environments |
| `full` | All assets (default) | Production, multi-domain projects |
| `web-app` | Full-stack web assets | TypeScript/Python full-stack teams |
| `data-eng` | Data engineering assets | Airflow/Spark/dbt/Kafka/Snowflake teams |
| `harness-dev` | oh-my-customcode development assets | Maintaining and extending the harness itself |

## Usage

```bash
omcustom install --profile minimal
omcustom install --profile web-app
omcustom install           # defaults to full
```

Profiles are defined in `templates/manifest.json#profiles`. The `--profile` flag filters which agents/skills/guides are activated during install — inactive assets are not injected into context, reducing per-session token cost.

## Cross-References

- [manifest-install guide](profiles-manifest-install.md) — full profile spec and include patterns
- [[analysis]] — `/omcustom:analysis` auto-detects project type and can suggest an appropriate profile
- [[adaptive-harness]] — post-install harness optimization that deactivates unused agents
- [[mgr-creator]] — handles agent/skill creation when expanding beyond a profile's defaults
