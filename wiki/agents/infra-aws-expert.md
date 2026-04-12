---
title: infra-aws-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/infra-aws-expert.md
related:
  - [[infra-docker-expert]]
  - [[mgr-gitnerd]]
---

# infra-aws-expert

Expert AWS cloud architect for Well-Architected Framework design, infrastructure as code (CloudFormation/CDK/Terraform), VPC networking, IAM security, and cost optimization.

## Overview

`infra-aws-expert` designs and implements scalable, secure, cost-effective AWS infrastructure following the AWS Well-Architected Framework (five pillars: operational excellence, security, reliability, performance efficiency, cost optimization). Key capabilities include IaC with CloudFormation, CDK, and Terraform; VPC/subnet/security group configuration; compute services (EC2, ECS, Lambda); IAM and KMS security hardening; and cost optimization recommendations.

Uses `aws-best-practices` skill and `guides/aws/`. Memory is `user`-scoped for cross-project AWS knowledge retention.

## Key Details

- **Model**: sonnet
- **Domain**: devops
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `aws-best-practices`
- **Memory**: user (cross-project AWS knowledge)
- **Effort**: high

## Relationships

- **Depends on**: `aws-best-practices` skill, `guides/aws/`
- **Used by**: R010 delegation table (AWS infrastructure), `secretary-routing` (infra tasks)
- **See also**: [[infra-docker-expert]] (container workloads on ECS/EKS), [[mgr-gitnerd]] (CI/CD pipelines)

## Sources

- `.claude/agents/infra-aws-expert.md` — agent definition
