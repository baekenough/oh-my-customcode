---
name: aws-best-practices
description: AWS patterns from Well-Architected Framework
user-invocable: false
---

## Purpose

Apply AWS patterns for building scalable, secure, and cost-effective cloud infrastructure.

## Well-Architected Framework Pillars

### 1. Operational Excellence

```yaml
principles:
  - Perform operations as code
  - Make frequent, small, reversible changes
  - Refine operations procedures frequently
  - Anticipate failure
  - Learn from all operational failures

practices:
  - Use CloudFormation/CDK for IaC
  - Implement CI/CD pipelines
  - Use CloudWatch for monitoring
  - Set up alarms and dashboards
  - Document runbooks
```

### 2. Security

```yaml
principles:
  - Implement strong identity foundation
  - Enable traceability
  - Apply security at all layers
  - Automate security best practices
  - Protect data in transit and at rest
  - Keep people away from data
  - Prepare for security events

iam:
  - Use least privilege principle
  - Never use root account for daily tasks
  - Enable MFA for all users
  - Use IAM roles for services
  - Rotate credentials regularly

patterns: |
  # IAM Policy - Least Privilege
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": "10.0.0.0/8"
        }
      }
    }]
  }
```

### 3. Reliability

```yaml
principles:
  - Automatically recover from failure
  - Test recovery procedures
  - Scale horizontally
  - Stop guessing capacity
  - Manage change through automation

practices:
  - Multi-AZ deployments
  - Auto Scaling groups
  - Health checks and self-healing
  - Backup and disaster recovery
  - Loose coupling with queues

patterns:
  high_availability: |
    # Multi-AZ RDS
    - Primary in us-east-1a
    - Standby in us-east-1b
    - Read replicas in us-east-1c

  auto_scaling: |
    # Target tracking scaling
    - Metric: CPUUtilization
    - Target: 70%
    - Min: 2, Max: 10
```

### 4. Performance Efficiency

```yaml
principles:
  - Democratize advanced technologies
  - Go global in minutes
  - Use serverless architectures
  - Experiment more often
  - Consider mechanical sympathy

compute:
  - Right-size instances
  - Use Spot for fault-tolerant workloads
  - Consider Graviton (ARM) processors
  - Containerize with ECS/EKS

storage:
  - Use appropriate storage class
  - S3 Intelligent-Tiering for variable access
  - EBS volume types based on IOPS needs

database:
  - Aurora for MySQL/PostgreSQL
  - DynamoDB for key-value/document
  - ElastiCache for caching
```

### 5. Cost Optimization

```yaml
principles:
  - Implement cloud financial management
  - Adopt consumption model
  - Measure overall efficiency
  - Stop spending on undifferentiated heavy lifting
  - Analyze and attribute expenditure

practices:
  - Use Reserved Instances/Savings Plans
  - Right-size resources
  - Delete unused resources
  - Use Spot Instances
  - Implement auto scaling

tools:
  - AWS Cost Explorer
  - AWS Budgets
  - AWS Trusted Advisor
  - Cost Allocation Tags
```

### 6. Sustainability

```yaml
principles:
  - Understand your impact
  - Establish sustainability goals
  - Maximize utilization
  - Anticipate and adopt more efficient offerings
  - Use managed services
  - Reduce downstream impact

practices:
  - Use efficient instance types (Graviton)
  - Optimize storage lifecycle
  - Use serverless where possible
  - Select regions with lower carbon intensity
```

## Common Patterns

### VPC Design

```yaml
pattern: |
  VPC (10.0.0.0/16)
  ├── Public Subnets
  │   ├── us-east-1a: 10.0.1.0/24
  │   ├── us-east-1b: 10.0.2.0/24
  │   └── us-east-1c: 10.0.3.0/24
  ├── Private Subnets (App)
  │   ├── us-east-1a: 10.0.11.0/24
  │   ├── us-east-1b: 10.0.12.0/24
  │   └── us-east-1c: 10.0.13.0/24
  └── Private Subnets (Data)
      ├── us-east-1a: 10.0.21.0/24
      ├── us-east-1b: 10.0.22.0/24
      └── us-east-1c: 10.0.23.0/24

components:
  - Internet Gateway (public access)
  - NAT Gateway (private outbound)
  - VPC Endpoints (AWS services)
  - Network ACLs (subnet level)
  - Security Groups (instance level)
```

### Three-Tier Architecture

```yaml
pattern: |
  [Internet]
      │
  [CloudFront]
      │
  [ALB] ← Public Subnet
      │
  [ECS/EC2] ← Private Subnet (App)
      │
  [RDS Multi-AZ] ← Private Subnet (Data)

components:
  web_tier:
    - CloudFront for CDN
    - WAF for protection
    - ALB for load balancing

  app_tier:
    - ECS Fargate or EC2
    - Auto Scaling
    - ElastiCache

  data_tier:
    - RDS Multi-AZ
    - Read Replicas
    - Automated backups
```

### Serverless Pattern

```yaml
pattern: |
  [API Gateway]
      │
  [Lambda] → [DynamoDB]
      │
  [SQS] → [Lambda] → [S3]

components:
  - API Gateway for REST/HTTP APIs
  - Lambda for compute
  - DynamoDB for NoSQL
  - SQS for decoupling
  - S3 for storage
  - Step Functions for orchestration
```

### CI/CD Pipeline

```yaml
pattern: |
  [CodeCommit/GitHub]
      │
  [CodePipeline]
      │
  ├── [CodeBuild] - Build & Test
  │
  ├── [ECR] - Container Registry
  │
  └── [CodeDeploy/ECS] - Deploy

practices:
  - Blue/Green deployments
  - Canary releases
  - Automated rollback
  - Infrastructure as Code
```

## Application

When designing AWS architecture:

1. **Always** follow least privilege for IAM
2. **Always** use Multi-AZ for production
3. **Always** encrypt data at rest and in transit
4. **Prefer** managed services over self-managed
5. **Implement** monitoring and alerting
6. **Use** IaC for all infrastructure
7. **Design** for failure
8. **Optimize** costs continuously
