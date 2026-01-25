# Skills Reference

Skills encapsulate knowledge and best practices that agents can use. oh-my-customcode includes 17 pre-built skills.

## Overview

| Category | Count | Purpose |
|----------|-------|---------|
| Development | 8 | Language-specific best practices |
| Backend | 3 | Framework-specific patterns |
| Infrastructure | 2 | DevOps and deployment |
| System | 2 | Core system utilities |
| Orchestration | 2 | Workflow coordination |

## Development Skills

### go-best-practices

**Category**: development

Best practices for Go development including:

- Effective Go patterns
- Error handling
- Concurrency patterns
- Testing strategies
- Code organization

**Used by**: golang-expert, go-backend-expert

### python-best-practices

**Category**: development

Best practices for Python development including:

- PEP 8 style guide
- Type hints
- Testing with pytest
- Virtual environments
- Package management

**Used by**: python-expert, fastapi-expert

### typescript-best-practices

**Category**: development

Best practices for TypeScript development including:

- Type system usage
- Strict mode
- Module patterns
- Testing strategies
- Build configuration

**Used by**: typescript-expert, nestjs-expert, express-expert

### kotlin-best-practices

**Category**: development

Best practices for Kotlin development including:

- Kotlin idioms
- Null safety
- Coroutines
- Testing with JUnit
- Gradle configuration

**Used by**: kotlin-expert, springboot-expert

### rust-best-practices

**Category**: development

Best practices for Rust development including:

- Ownership patterns
- Error handling
- Testing
- Cargo usage
- Memory safety

**Used by**: rust-expert

### react-best-practices

**Category**: development

Best practices for React development including:

- Component patterns
- Hooks usage
- State management
- Performance optimization
- Testing with Jest/RTL

**Used by**: vercel-agent

### web-design-guidelines

**Category**: development

Web design principles including:

- Responsive design
- Accessibility (a11y)
- CSS patterns
- UI/UX principles
- Performance

**Used by**: vercel-agent, vuejs-agent, svelte-agent

### vercel-deploy

**Category**: development

Vercel deployment practices including:

- Vercel configuration
- Environment variables
- Edge functions
- Build optimization
- Preview deployments

**Used by**: vercel-agent

## Backend Skills

### fastapi-best-practices

**Category**: backend

FastAPI patterns and practices including:

- Dependency injection
- Pydantic models
- Async patterns
- OpenAPI documentation
- Testing

**Used by**: fastapi-expert

### springboot-best-practices

**Category**: backend

Spring Boot patterns and practices including:

- Spring annotations
- Configuration
- Security
- Testing
- JPA/Hibernate

**Used by**: springboot-expert

### go-backend-best-practices

**Category**: backend

Go backend patterns including:

- HTTP server patterns
- Database access
- Middleware
- Configuration
- Testing

**Used by**: go-backend-expert

## Infrastructure Skills

### docker-best-practices

**Category**: infrastructure

Docker best practices including:

- Dockerfile optimization
- Multi-stage builds
- Security scanning
- Compose patterns
- Layer caching

**Used by**: docker-expert

### aws-best-practices

**Category**: infrastructure

AWS best practices including:

- IAM policies
- VPC design
- Cost optimization
- Security groups
- CloudFormation/CDK

**Used by**: aws-expert

## System Skills

### memory-management

**Category**: system

Memory and context management including:

- Session persistence
- Context retrieval
- Memory indexing
- Query patterns
- Cleanup strategies

**Used by**: memory-keeper

### result-aggregation

**Category**: system

Result aggregation patterns including:

- Parallel result collection
- Error aggregation
- Status summarization
- Report generation

**Used by**: secretary, planner

## Orchestration Skills

### pipeline-execution

**Category**: orchestration

Pipeline execution patterns including:

- Step sequencing
- Variable passing
- Error handling
- Progress tracking
- Conditional execution

**Used by**: planner, secretary

### intent-detection

**Category**: orchestration

Intent detection patterns including:

- Keyword matching
- File pattern recognition
- Action verb detection
- Confidence scoring
- Agent routing

**Used by**: secretary

## Skill Structure

Each skill follows this structure:

```
skills/{category}/{skill-name}/
├── SKILL.md       # Instructions and patterns
└── index.yaml     # Metadata and configuration
```

### SKILL.md Example

```markdown
# My Skill

> Brief description

## Overview

What this skill provides.

## Instructions

Detailed instructions for using this skill.

## Best Practices

- Practice 1
- Practice 2

## Anti-patterns

- What to avoid
```

### index.yaml Example

```yaml
metadata:
  name: my-skill
  category: development
  version: 1.0.0
  description: Skill description

applicable_to:
  - agent-1
  - agent-2
```

## Using Skills

Skills are automatically loaded when an agent that uses them is activated. Agents reference skills in their `index.yaml`:

```yaml
skills:
  - category: development
    name: go-best-practices
```

## Creating Custom Skills

See [Customization](/guide/customization) for creating your own skills.
