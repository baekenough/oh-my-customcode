# AWS Well-Architected Framework

> Source: https://docs.aws.amazon.com/wellarchitected/

## Overview

The AWS Well-Architected Framework helps you understand the pros and cons of decisions you make while building systems on AWS.

## Six Pillars

### 1. Operational Excellence

Focus on running and monitoring systems to deliver business value.

**Design Principles:**
- Perform operations as code
- Make frequent, small, reversible changes
- Refine operations procedures frequently
- Anticipate failure
- Learn from operational failures

**Key Services:**
- AWS CloudFormation
- AWS Config
- Amazon CloudWatch
- AWS Systems Manager

### 2. Security

Protect information, systems, and assets.

**Design Principles:**
- Implement strong identity foundation
- Enable traceability
- Apply security at all layers
- Automate security best practices
- Protect data in transit and at rest
- Keep people away from data
- Prepare for security events

**Key Services:**
- AWS IAM
- AWS KMS
- AWS WAF
- Amazon GuardDuty
- AWS Security Hub

### 3. Reliability

Ensure workload performs correctly and consistently.

**Design Principles:**
- Automatically recover from failure
- Test recovery procedures
- Scale horizontally
- Stop guessing capacity
- Manage change through automation

**Key Services:**
- Amazon Route 53
- Elastic Load Balancing
- Auto Scaling
- AWS Backup

### 4. Performance Efficiency

Use computing resources efficiently.

**Design Principles:**
- Democratize advanced technologies
- Go global in minutes
- Use serverless architectures
- Experiment more often
- Consider mechanical sympathy

**Key Services:**
- Amazon EC2 Auto Scaling
- AWS Lambda
- Amazon ElastiCache
- Amazon CloudFront

### 5. Cost Optimization

Avoid unnecessary costs.

**Design Principles:**
- Implement cloud financial management
- Adopt consumption model
- Measure overall efficiency
- Stop spending money on undifferentiated heavy lifting
- Analyze and attribute expenditure

**Key Services:**
- AWS Cost Explorer
- AWS Budgets
- AWS Trusted Advisor
- Savings Plans

### 6. Sustainability

Minimize environmental impacts.

**Design Principles:**
- Understand your impact
- Establish sustainability goals
- Maximize utilization
- Anticipate and adopt efficient offerings
- Use managed services
- Reduce downstream impact

## Well-Architected Review

### Questions to Ask

**Operational Excellence:**
- How do you manage and automate changes?
- How do you respond to unplanned events?
- How do you evolve operations?

**Security:**
- How do you manage identities?
- How do you detect security events?
- How do you protect your network?

**Reliability:**
- How do you manage service quotas?
- How does your system adapt to demand?
- How do you back up data?

**Performance Efficiency:**
- How do you select compute resources?
- How do you select storage solutions?
- How do you configure networking?

**Cost Optimization:**
- How do you manage usage?
- How do you monitor cost?
- How do you decommission resources?

**Sustainability:**
- How do you select efficient hardware?
- How do you reduce software impact?
- How do you reduce data movement?
