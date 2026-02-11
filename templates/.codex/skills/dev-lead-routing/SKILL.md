---
name: dev-lead-routing
description: Routes development tasks to the correct language or framework expert agent. Use when user requests code review, implementation, refactoring, or debugging.
user-invocable: false
---

# Dev Lead Routing

## Engineers

| Type | Agents |
|------|--------|
| Language | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| Frontend | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent |
| Backend | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-nestjs-expert, be-express-expert |
| Tooling | tool-npm-expert, tool-optimizer, tool-bun-expert |
| Database | db-supabase-expert, db-postgres-expert, db-redis-expert |
| Architect | arch-documenter, arch-speckit-agent |
| Infra | infra-docker-expert, infra-aws-expert |

## File Extension Mapping

| Extension | Agent |
|-----------|-------|
| `.go` | lang-golang-expert |
| `.py` | lang-python-expert |
| `.rs` | lang-rust-expert |
| `.kt`, `.kts` | lang-kotlin-expert |
| `.ts`, `.tsx` | lang-typescript-expert |
| `.java` | lang-java21-expert |
| `.js/.jsx` (React) | fe-vercel-agent |
| `.vue` | fe-vuejs-agent |
| `.svelte` | fe-svelte-agent |
| `.sql` (PG) | db-postgres-expert |
| `.sql` (Supabase) | db-supabase-expert |
| `Dockerfile`, `*.dockerfile` | infra-docker-expert |
| `*.tf`, `*.tfvars` | infra-aws-expert |
| `*.yaml`, `*.yml` (CloudFormation) | infra-aws-expert |

## Keyword Mapping

| Keywords | Agent |
|----------|-------|
| go, golang | lang-golang-expert |
| python, py | lang-python-expert |
| rust | lang-rust-expert |
| kotlin | lang-kotlin-expert |
| typescript, ts | lang-typescript-expert |
| java | lang-java21-expert |
| react, next.js, vercel | fe-vercel-agent |
| vue | fe-vuejs-agent |
| svelte | fe-svelte-agent |
| fastapi | be-fastapi-expert |
| spring, springboot | be-springboot-expert |
| nestjs | be-nestjs-expert |
| express | be-express-expert |
| npm | tool-npm-expert |
| optimize, bundle | tool-optimizer |
| bun | tool-bun-expert |
| postgres, postgresql, psql, pg_stat | db-postgres-expert |
| redis, cache, pub/sub, sorted set | db-redis-expert |
| supabase, rls, edge function | db-supabase-expert |
| docker, dockerfile, container, compose | infra-docker-expert |
| aws, cloudformation, vpc, iam, s3, lambda, cdk, terraform | infra-aws-expert |
| architecture, adr, openapi, swagger, diagram | arch-documenter |
| spec, specification, tdd, requirements | arch-speckit-agent |

## Model Selection

| Task | Model |
|------|-------|
| Architecture analysis | opus |
| Code review/implementation | sonnet |
| Quick validation/search | haiku |

## Routing Rules

Multi-language: detect all languages, route to parallel experts (max 4). Single-language: route to matching expert. Cross-layer (frontend + backend): multiple experts in parallel.

Not user-invocable. Auto-triggered on development intent.
