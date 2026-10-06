---
title: "Multi-Provider Exec Guide"
type: guide
updated: 2026-10-06
sources:
  - guides/multi-provider-exec/README.md
related:
  - [[multi-model-routing]]
  - [[skill-bundle-design]]
  - [[r006]]
  - [[r009]]
---

# Multi-Provider Exec Guide

Unified reference for executing prompts through external LLM providers via exec skills. Complements the [[multi-model-routing]] guide (Claude model selection) with cross-provider execution capabilities, inspired by OpenHarness's provider profile switching pattern.

## Overview

In v1.1.107, project RTK integration and the public `/rtk-exec` skill are retired. Earlier RTK execution examples and recommendations no longer apply. This change does not uninstall a separately installed RTK binary on the user's machine.

## Availability and Provider Selection

The SessionStart `session-env-check.sh` hook retains its existing CLI availability checks for Codex and Gemini; RTK availability checks and status output are retired. Availability detection does not establish a replacement public execution skill. Select providers using the available skill's actual contract and CLI configuration.

## Integration

[[reasoning-sandwich]] supports pre/post reasoning around an explicitly selected exec skill. [[model-escalation]] operates within Claude model tiers rather than across providers. The guide introduces no replacement RTK command or automatic provider fallback.

## Design Decisions

Cross-provider results are advisory — Claude remains the primary execution engine. Missing CLIs are silently skipped; providers are opt-in. Each skill reads its own CLI configuration. Removing RTK configuration connections does not delete other CLIs' user settings. Provider-specific rate limits and costs are not tracked by oh-my-customcode.

## Relationships

- **Complement**: [[multi-model-routing]] — Claude model tier selection (haiku/sonnet/opus)
- **Integration**: [[skill-bundle-design]] — exec skills compose with `reasoning-sandwich`, `multi-model-verification`
- **Rules**: [[r006]] (agent design, tool constraints), [[r009]] (parallel exec)
- **References**: [Multi-Model Routing](multi-model-routing.md), [Skill Bundle Design](skill-bundle-design.md)

## Sources

- `guides/multi-provider-exec/README.md` — provider matrix, availability detection, usage patterns, configuration
