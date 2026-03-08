---
name: dev-lead-routing
description: Routes development tasks to the correct language or framework expert agent. Use when user requests code review, implementation, refactoring, or debugging.
user-invocable: false
context: fork
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

## Routing Decision (Priority Order)

Before selecting an expert agent, evaluate in this order:

### Step 1: Agent Teams Eligibility (R018)
Check if Agent Teams is available (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present).

| Scenario | Preferred |
|----------|-----------|
| Single-language review | Task Tool |
| Multi-language code review (3+) | Agent Teams |
| Code review + fix cycle | Agent Teams |
| Cross-layer debugging (FE + BE + DB) | Agent Teams |
| Simple file search/validation | Task Tool |

### Step 2: Codex-Exec Hybrid (Implementation Tasks)
For **new file creation**, **boilerplate**, or **test code generation**:

1. Check `/tmp/.claude-env-status-*` for codex availability
2. If codex available → suggest hybrid workflow:
   - codex-exec generates initial code (strength: fast generation)
   - Claude expert reviews and refines (strength: reasoning, quality)
3. If codex unavailable → use Claude expert directly

**Suitable**: New file creation, boilerplate, scaffolding, test code
**Unsuitable**: Existing code modification, architecture decisions, bug fixes

### Step 3: Expert Agent Selection
Route to appropriate language/framework expert based on file extension and keyword mapping.

## Routing Rules

Multi-language: detect all languages, route to parallel experts (max 4). Single-language: route to matching expert. Cross-layer (frontend + backend): multiple experts in parallel.

## No Match Fallback

When file extension or keyword doesn't match any existing agent:

```
User Input → No matching development agent
  ↓
Detect: File extension (.rb, .swift, .dart, etc.) or language keyword
  ↓
Delegate to mgr-creator with context:
  domain: detected language/framework
  type: sw-engineer
  keywords: extracted from user input
  file_patterns: detected extensions
  skills: auto-discover from .claude/skills/
  guides: auto-discover from guides/
```

**Examples of dynamic creation triggers:**
- Unrecognized file extension (e.g., `.rb` → Ruby expert, `.swift` → Swift expert)
- New framework keyword (e.g., "Flutter 앱 리뷰해줘", "Rails API 만들어줘")
- Language detected but no specialist exists

Not user-invocable. Auto-triggered on development intent.
