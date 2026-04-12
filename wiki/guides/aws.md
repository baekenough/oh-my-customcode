---
title: "AWS Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/aws/common-patterns.md
related:
  - [[infra-aws-expert]]
  - [[aws-best-practices]]
---

# AWS Guide

Reference documentation for AWS architecture patterns and Well-Architected best practices.

## Overview

Covers common AWS architecture patterns for web applications, serverless APIs, event-driven systems, and data pipelines. The guide focuses on practical CloudFormation/CDK templates, service selection, and cost-optimized designs aligned with the AWS Well-Architected Framework. Used by `infra-aws-expert` for cloud infrastructure tasks.

## Key Topics

- Three-tier web application architecture (CloudFront, ALB, ECS/EC2, RDS Aurora)
- Serverless API patterns (API Gateway + Lambda + DynamoDB)
- Event-driven architecture with SQS, SNS, EventBridge
- Data pipeline patterns with S3, Glue, Athena
- IAM roles and least-privilege security
- Cost optimization and auto-scaling strategies

## Relationships

- **Used by agents**: [[infra-aws-expert]]
- **Related skills**: [[aws-best-practices]]
- **See also**: [[docker]], [[postgres]]

## Sources

- `guides/aws/common-patterns.md` — architecture diagrams, service patterns, infrastructure templates
