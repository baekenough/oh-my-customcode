---
title: infra-aws-expert
type: agent
updated: 2026-06-13
sources:
  - .claude/agents/infra-aws-expert.md
related:
  - [[infra-docker-expert]]
  - [[mgr-gitnerd]]
  - [[aws-best-practices]]
  - [[aws]]
---

# infra-aws-expert

Expert AWS cloud architect for Well-Architected Framework design, infrastructure as code (CloudFormation/CDK/Terraform), VPC networking, IAM security, cost optimization, and optional real-time AWS API execution via AWS MCP Server.

## Overview

`infra-aws-expert` designs and implements scalable, secure, cost-effective AWS infrastructure following the AWS Well-Architected Framework (six pillars: operational excellence, security, reliability, performance efficiency, cost optimization, sustainability). Key capabilities include IaC with CloudFormation, CDK, and Terraform; VPC/subnet/security group configuration; compute services (EC2, ECS, Lambda); IAM and KMS security hardening; and cost optimization recommendations.

Uses `aws-best-practices` skill (offline Well-Architected patterns) and `guides/aws/` (reference). When the AWS MCP Server is installed, extends to real-time documentation lookup and live AWS API execution. Memory is `user`-scoped for cross-project AWS knowledge retention.

## Key Details

- **Model**: sonnet
- **Domain**: devops
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `aws-best-practices`
- **Memory**: user (cross-project AWS knowledge)
- **Effort**: high

## AWS MCP Server Integration (opt-in)

The AWS MCP Server is a remote MCP server managed by AWS that provides live documentation lookup and real AWS API execution — filling two gaps not covered by the offline skill: knowledge-cutoff staleness and lack of direct execution.

| Tool | Purpose | Privilege |
|------|---------|-----------|
| `search_documentation` | Full-text search of latest AWS docs | Read-only, safe |
| `read_documentation` | Fetch a specific AWS documentation page | Read-only, safe |
| `call_aws` | Execute 15,000+ AWS API operations via existing IAM credentials | **HIGH — create/modify/delete resources** |
| `run_script` | Sandboxed Python with IAM permissions (no network/filesystem) | Sandboxed, IAM-scoped |

**Workflow priority**: use `search_documentation`/`read_documentation` first; generate IaC by default; use `call_aws` only on explicit user request with confirmed scope.

**Activation (opt-in, user-manual)**: R001 prohibits auto-installation. See [guides/aws/](guides/aws/) for the install command.

### R010/R001 Privileged-Scope Boundary

`call_aws` can create, modify, and delete real AWS resources — high-privilege execution.

- Orchestrator MUST NOT call `call_aws` directly (R010) — delegate to this agent only.
- Delegation prompt MUST state: approved actions, forbidden actions, and authorization scope.
- Default to read-only (`Describe*`/`List*`); write/delete require explicit per-invocation user approval.
- NEVER echo IAM credentials, access keys, or secret values into transcript (R001).

Security features: IAM context key-based access control; CloudWatch `AWS-MCP` namespace; CloudTrail audit trail for all `call_aws` calls.

## Workflow

1. Understand requirements
2. If aws-mcp available, use `search_documentation` to verify current AWS docs for the relevant service
3. Apply [[aws-best-practices]] skill for offline Well-Architected guidance
4. Reference [[aws]] guide for specifics
5. Design/review architecture — prefer IaC code generation over live `call_aws`
6. If real AWS operations needed, confirm scope with user, then use `call_aws` within approved boundary
7. Ensure security, scalability, cost optimization

## Relationships

- **Depends on**: [[aws-best-practices]] skill, [[aws]] guide
- **Used by**: R010 delegation table (AWS infrastructure), `secretary-routing` (infra tasks)
- **See also**: [[infra-docker-expert]] (container workloads on ECS/EKS), [[mgr-gitnerd]] (CI/CD pipelines)

## Sources

- `.claude/agents/infra-aws-expert.md` — agent definition
