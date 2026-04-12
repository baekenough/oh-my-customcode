---
title: slack-cli-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/slack-cli-expert.md
related:
  - [[infra-docker-expert]]
  - [[mgr-gitnerd]]
---

# slack-cli-expert

Expert Slack CLI developer for building, deploying, and managing Slack apps — covering app lifecycle, authentication, event triggers, datastore operations, and workspace automation.

## Overview

`slack-cli-expert` handles the complete Slack app development lifecycle using the official Slack CLI (`slack` command). Key capabilities include app creation/deployment/deletion, workspace authentication management, event trigger CRUD operations, datastore operations (put/get/query/bulk), app environment variable management, collaborator management, local development server, and manifest validation.

Uses `guides/slack-cli/` for detailed command reference. Always starts with `slack doctor` for system diagnostics.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: (none specified)
- **Effort**: medium

## Relationships

- **Depends on**: Slack CLI tool, `guides/slack-cli/`
- **Used by**: `secretary-routing` (Slack workspace automation tasks)
- **See also**: [[infra-docker-expert]] (server deployment), [[mgr-gitnerd]] (CI/CD for Slack apps)

## Sources

- `.claude/agents/slack-cli-expert.md` — agent definition
