---
title: AWS Best Practices
type: skill
updated: 2026-06-13
sources:
  - .claude/skills/aws-best-practices/SKILL.md
related:
  - [[infra-aws-expert]]
  - [[docker-best-practices]]
  - [[aws]]
---

# AWS Best Practices

AWS patterns from Well-Architected Framework — offline core for cloud infrastructure design.

## Overview

Provides static Well-Architected patterns that work without credentials or network access — the always-available baseline for [[infra-aws-expert]]. Covers six pillars (operational excellence, security, reliability, performance efficiency, cost optimization, sustainability) and common patterns: IAM least-privilege, VPC three-tier design, serverless (Lambda/API Gateway/DynamoDB), CI/CD with CodePipeline, and multi-AZ reliability.

This skill is the **offline core**. For real-time AWS documentation, current API syntax, and up-to-date best practices that resolve knowledge-cutoff gaps, the AWS MCP Server's `search_documentation`/`read_documentation` tools serve as a complementary live source when installed. The two are designed to work together: static patterns for structural guidance, live docs for current specifics.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Offline vs Live Source

| Source | Type | Requires install? | Covers |
|--------|------|-------------------|--------|
| `aws-best-practices` (this skill) | Static, offline | No | Well-Architected structural patterns |
| AWS MCP `search_documentation` | Real-time | Yes (user-manual, R001) | Current API syntax, service limits, new features |

See [[infra-aws-expert]] for AWS MCP Server setup instructions and privileged-scope boundary rules.

## Relationships

- **Used by agents**: [[infra-aws-expert]]
- **Related skills**: [[docker-best-practices]]
- **See also**: [[aws]] guide (reference index, mcp_server section)

## Sources

- `.claude/skills/aws-best-practices/SKILL.md` — skill definition
