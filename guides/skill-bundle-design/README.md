# Domain Skill Bundle Design Guide

## Overview

Domain skill bundles package related skills, agents, and guides for a specific technology or framework. This guide defines the standard pattern based on the Author/Test/Troubleshoot tri-pattern (inspired by Microsoft Copilot Studio Skills).

## The Author/Test/Troubleshoot Pattern

Every domain skill bundle should provide three capability axes:

### Author (Create & Edit)
Skills and agents that help CREATE artifacts in the domain.

| Component | Example (Spring Boot) | Example (Airflow) |
|-----------|----------------------|-------------------|
| Best practices skill | springboot-best-practices | airflow-best-practices |
| Expert agent | be-springboot-expert | de-airflow-expert |
| Code generation | Scaffold, boilerplate | DAG authoring |

### Test (Verify & Validate)
Skills and agents that help VERIFY correctness.

| Component | Example (Spring Boot) | Example (Airflow) |
|-----------|----------------------|-------------------|
| Review skill | dev-review | dev-review |
| QA workflow | qa-lead-routing | qa-lead-routing |
| Domain-specific checks | Spring actuator health | DAG validation |

### Troubleshoot (Debug & Fix)
Skills and agents that help DIAGNOSE and FIX issues.

| Component | Example (Spring Boot) | Example (Airflow) |
|-----------|----------------------|-------------------|
| Debugging skill | systematic-debugging | systematic-debugging |
| Domain diagnostics | Spring Boot Actuator | Airflow log analysis |
| Fix patterns | Common Spring errors | DAG failure patterns |

## Existing Bundle Inventory

Map existing oh-my-customcode skills/agents to the tri-pattern:

| Domain | Author | Test | Troubleshoot | Completeness |
|--------|--------|------|-------------|-------------|
| Spring Boot | springboot-best-practices, be-springboot-expert | dev-review | systematic-debugging | ★★★ |
| FastAPI | fastapi-best-practices, be-fastapi-expert | dev-review | systematic-debugging | ★★★ |
| Go | go-best-practices, lang-golang-expert, be-go-backend-expert | dev-review | systematic-debugging | ★★★ |
| Airflow | airflow-best-practices, de-airflow-expert | dev-review | systematic-debugging | ★★★ |
| React/Next.js | react-best-practices, fe-vercel-agent | web-design-guidelines | systematic-debugging | ★★★ |
| PostgreSQL | postgres-best-practices, db-postgres-expert | dev-review | systematic-debugging | ★★★ |
| Docker | docker-best-practices, infra-docker-expert | dev-review | systematic-debugging | ★★☆ |
| Kafka | kafka-best-practices, de-kafka-expert | dev-review | systematic-debugging | ★★☆ |
| Redis | redis-best-practices, db-redis-expert | dev-review | systematic-debugging | ★★☆ |

## Creating a New Bundle

### Checklist

1. **Author axis**:
   - [ ] Best practices skill (`.claude/skills/{domain}-best-practices/SKILL.md`)
   - [ ] Expert agent (`.claude/agents/{type}-{domain}-expert.md`)
   - [ ] Reference guide (`guides/{domain}/`)

2. **Test axis**:
   - [ ] Domain-specific test patterns documented in best practices skill
   - [ ] Integration with qa-lead-routing or dev-review

3. **Troubleshoot axis**:
   - [ ] Common error patterns documented in best practices skill
   - [ ] Integration with systematic-debugging

### Minimum Viable Bundle

At minimum, a domain bundle needs:
- 1 best practices skill (Author)
- 1 expert agent (Author + Troubleshoot)
- Integration with dev-review (Test)

### Template

```
guides/{domain}/
├── README.md          # Domain overview and quick reference
├── patterns.md        # Common patterns and anti-patterns
└── troubleshooting.md # Common errors and solutions

.claude/skills/{domain}-best-practices/
└── SKILL.md           # Best practices skill

.claude/agents/{type}-{domain}-expert.md  # Expert agent
```

## Relationship to Other Skills

| Skill | Role in Bundle Pattern |
|-------|----------------------|
| dev-review | Universal Test axis |
| systematic-debugging | Universal Troubleshoot axis |
| adversarial-review | Advanced Test axis (security) |
| qa-lead-routing | Test orchestration |
| mgr-creator | Bundle creation automation |

## References

- Microsoft Copilot Studio Skills: Author/Test/Troubleshoot pattern
- oh-my-customcode R006: Agent Design (separation of concerns)
- oh-my-customcode compilation metaphor: skills = source, agents = build artifacts
