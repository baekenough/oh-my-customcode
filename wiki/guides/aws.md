---
title: "AWS Guide"
type: guide
updated: 2026-06-13
sources:
  - guides/aws/index.yaml
  - guides/aws/common-patterns.md
related:
  - [[infra-aws-expert]]
  - [[aws-best-practices]]
---

# AWS Guide

Reference documentation for AWS architecture patterns, Well-Architected best practices, and the live AWS MCP Server integration.

## Overview

Covers common AWS architecture patterns for web applications, serverless APIs, event-driven systems, and data pipelines. The guide focuses on practical CloudFormation/CDK templates, service selection, and cost-optimized designs aligned with the AWS Well-Architected Framework. Used by [[infra-aws-expert]] for cloud infrastructure tasks.

The guide has two layers: static documents (last fetched 2026-01-22, may be stale) and the AWS MCP Server as a live, real-time source. For current API syntax and best practices, the MCP server takes precedence over the static documents.

## Static Documents

- Three-tier web application architecture (CloudFront, ALB, ECS/EC2, RDS Aurora)
- Serverless API patterns (API Gateway + Lambda + DynamoDB)
- Event-driven architecture with SQS, SNS, EventBridge
- Data pipeline patterns with S3, Glue, Athena
- IAM roles and least-privilege security
- Cost optimization and auto-scaling strategies

## AWS MCP Server (Live Source)

The `index.yaml` `mcp_server` section documents the AWS-managed remote MCP server that serves as the real-time counterpart to these static documents.

| Tool | Purpose | Privilege |
|------|---------|-----------|
| `search_documentation` | Full-text search of latest AWS docs (read-only, safe) | Low |
| `read_documentation` | Fetch a specific AWS documentation page (read-only, safe) | Low |
| `call_aws` | Execute AWS API operations via IAM credentials — **HIGH privilege** | High |
| `run_script` | Sandboxed Python with IAM permissions | Sandboxed |

- **Endpoint**: `https://aws-mcp.us-east-1.api.aws/mcp`
- **Regional availability**: us-east-1, eu-central-1 (AWS API calls possible in all regions)
- **Activation**: user-manual only — R001 prohibits auto-installation. See [[infra-aws-expert]] for the install command.

## Relationships

- **Used by agents**: [[infra-aws-expert]]
- **Related skills**: [[aws-best-practices]]
- **See also**: [[docker]], [[postgres]]

## Sources

- `guides/aws/index.yaml` — metadata, mcp_server section, document index
- `guides/aws/common-patterns.md` — architecture diagrams, service patterns, infrastructure templates
