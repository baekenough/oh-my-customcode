---
title: "Security Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/security/agentshield-pre-flight.md
related:
  - [[security-agentshield-pre-flight]]
  - [[sec-agentshield-wrapper]]
  - [[sec-codeql-expert]]
  - [[adversarial-review]]
  - [[cve-triage]]
  - [[R001]]
---

# Security Guide

Reference documentation for security patterns in oh-my-customcode. Covers pre-write threat analysis, post-write code review, static analysis, and CVE triage.

## Contents

| File | Description |
|------|-------------|
| [agentshield-pre-flight.md](../security/agentshield-pre-flight.md) | Pre-write security analysis pattern — identifies trust boundary risks before implementation starts |

## Security Asset Timeline

oh-my-customcode structures security across three execution points:

| Timing | Asset | Role |
|--------|-------|------|
| pre-write | `sec-agentshield-wrapper` skill | Intent-based risk identification before code is written |
| post-write | `adversarial-review` skill | Attacker-mindset 4-stage code review |
| post-write | `sec-codeql-expert` agent | CodeQL static analysis and CVE matching |
| issue-triggered | `cve-triage` skill | CVE assessment and patch verification |

The pre-write phase (AgentShield) is the primary contribution of this guide directory — shifting security left so design decisions are informed before implementation begins.

## Key Concepts

**Pre-flight pattern**: Run `/sec-agentshield-wrapper "<description>"` before starting any code change with trust boundary implications. Returns proceed/caution/block advisory.

**CRG integration**: The AgentShield pre-flight can consume `get_minimal_context` from the code-review-graph MCP for AST-based trust boundary analysis with 8.2x token reduction.

## Cross-References

- [agentshield-pre-flight guide](security-agentshield-pre-flight.md) — full pipeline and scenario examples
- [[sec-agentshield-wrapper]] — skill definition
- [[sec-codeql-expert]] — post-write static analysis agent
- [[adversarial-review]] — post-write adversarial review skill
- [[R001]] — safety rules that define prohibited actions
