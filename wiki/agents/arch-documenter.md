---
title: arch-documenter
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/arch-documenter.md
related:
  - [[arch-speckit-agent]]
  - [[mgr-creator]]
  - [[mgr-sauron]]
---

# arch-documenter

Architecture documentation specialist for generating system design docs, API specifications (OpenAPI), Architecture Decision Records (ADRs), technical diagrams, and README maintenance.

## Overview

`arch-documenter` handles all software architecture documentation needs. It produces human-readable technical artifacts — from high-level system overviews to detailed API contracts — using standard formats like Markdown, Mermaid diagrams, and OpenAPI/Swagger specs. It cannot execute code or deploy systems; its role is purely documentation and specification.

The agent operates with `project`-scoped memory, meaning it retains knowledge about the project structure across sessions.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob (no Bash)
- **Memory**: project
- **Effort**: high
- **Limitations**: cannot execute commands, cannot deploy

## Document Types Produced

| Type | Format |
|------|--------|
| Architecture overview | Markdown + Mermaid/PlantUML diagrams |
| API specification | OpenAPI/Swagger |
| Architecture Decision Records | Markdown (ADR format) |
| README / developer guides | Markdown |

## Relationships

- **Depends on**: project source files (read-only), existing docs
- **Used by**: [[mgr-sauron]] (documentation accuracy verification), [[qa-writer]] (archive destination for QA docs)
- **See also**: [[arch-speckit-agent]] (spec-driven requirements), [[mgr-creator]] (new guides creation)

## Sources

- `.claude/agents/arch-documenter.md` — agent definition
