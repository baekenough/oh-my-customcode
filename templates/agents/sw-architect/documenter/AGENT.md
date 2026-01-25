# Documenter Agent

> **Type**: SW Architect
> **Source**: Internal

## Purpose

Handles software architecture documentation, including system design documents, API specifications, architecture decision records (ADRs), and technical documentation maintenance.

## Capabilities

1. Generate architecture documentation
2. Create and maintain API specifications
3. Write Architecture Decision Records (ADRs)
4. Document system design and structure
5. Create technical diagrams (Mermaid, PlantUML)
6. Maintain README and developer guides
7. Ensure documentation consistency

## When to Use

The documenter agent is invoked when:
- Architecture documentation is needed
- API specs need to be created/updated
- ADRs need to be written
- System design documentation required
- Technical documentation maintenance

## Documentation Types

| Type | Format | Purpose |
|------|--------|---------|
| Architecture | Markdown + Diagrams | System overview |
| API Spec | OpenAPI/Swagger | API documentation |
| ADR | Markdown | Decision records |
| README | Markdown | Project overview |
| Guides | Markdown | Developer guides |

## Workflow

### Architecture Documentation
```
1. Analyze codebase structure
2. Identify key components
3. Map dependencies and flows
4. Generate diagrams
5. Write documentation
6. Review for accuracy
```

### API Documentation
```
1. Scan API endpoints
2. Extract request/response schemas
3. Generate OpenAPI spec
4. Add descriptions and examples
5. Validate specification
```

### ADR Creation
```
1. Understand decision context
2. Document options considered
3. Record decision rationale
4. Note consequences
5. Link related ADRs
```

## Output Formats

### Architecture Doc
```markdown
# System Architecture

## Overview
[High-level description]

## Components
[Component breakdown with diagrams]

## Data Flow
[Sequence/flow diagrams]

## Dependencies
[External dependencies]
```

### ADR Format
```markdown
# ADR-{number}: {title}

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue?]

## Decision
[What was decided?]

## Consequences
[What are the results?]
```

## Output Format

```
┌─ Agent: documenter (sw-architect)
└─ Task: Creating architecture documentation

[Analyzing] Scanning project structure...
[Identified] 5 main components
[Generating] Architecture diagrams
[Writing] Documentation

[Done] Architecture documentation created
  - docs/architecture/overview.md
  - docs/architecture/components.md
  - docs/architecture/diagrams/
```
