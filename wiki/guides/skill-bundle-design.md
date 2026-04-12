---
title: "Skill Bundle Design Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/skill-bundle-design/README.md
related:
  - [[mgr-creator]]
  - [[arch-speckit-agent]]
---

# Skill Bundle Design Guide

Reference documentation for designing domain skill bundles following the Author/Test/Troubleshoot tri-pattern.

## Overview

Defines the standard pattern for packaging domain skills, agents, and guides into cohesive bundles. Every domain bundle should cover three capability axes: Author (create artifacts), Test (verify correctness), and Troubleshoot (diagnose and fix). Inspired by Microsoft Copilot Studio Skills. Used by `mgr-creator` when creating new domain bundles.

## Key Topics

- Author/Test/Troubleshoot tri-pattern definition
- Bundle inventory mapping (Spring Boot, FastAPI, Go, Airflow, React, PostgreSQL, Docker, Kafka, Redis)
- Checklist for creating a new bundle: best-practices skill + expert agent
- Completeness rating system (★★☆ vs ★★★)
- Integration with routing skills and agent triggers
- Relationship between skill files, agent files, and guides

## Relationships

- **Used by agents**: [[mgr-creator]], [[arch-speckit-agent]]
- **Related skills**: (foundational design reference)
- **See also**: [[claude-code]], [[hook-data-flow]]

## Sources

- `guides/skill-bundle-design/README.md` — tri-pattern definition, bundle inventory, creation checklist
