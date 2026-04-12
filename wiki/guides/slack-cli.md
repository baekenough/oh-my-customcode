---
title: "Slack CLI Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/slack-cli/README.md
related:
  - [[slack-cli-expert]]
---

# Slack CLI Guide

Reference documentation for the Slack CLI (v3.15.0) for building and deploying Slack apps with Deno SDK and Bolt frameworks.

## Overview

Covers Slack CLI installation, authentication, app lifecycle commands (`create`, `run`, `deploy`, `delete`), workflow automation with triggers, environment management, and debugging. Works with Deno Slack SDK (serverless functions) and Bolt for JavaScript/Python (socket mode). Used by `slack-cli-expert` for Slack platform development.

## Key Topics

- Installation and `slack doctor` diagnostics
- Authentication: `slack login`, `slack auth list`, token management
- App management: create, run (local), deploy (production), delete
- Trigger management for workflow automation
- Function and workflow definition patterns
- Environment and variable management
- `slack run` local development with hot reload

## Relationships

- **Used by agents**: [[slack-cli-expert]]
- **Related skills**: (Slack-specific CLI operations)
- **See also**: [[typescript]], [[docker]]

## Sources

- `guides/slack-cli/README.md` — CLI command reference, quick start, authentication
