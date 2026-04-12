---
name: omcustom:analysis
description: Analyze project and auto-configure agents, skills, rules, and guides
scope: harness
argument-hint: "[target-dir] [--interview]"
user-invocable: true
---

# Project Analysis Skill

Scan a project's tech stack, compare against installed agents/skills, and auto-configure missing items.

## Options

```
--dry-run      Show what would be added without making changes
--verbose      Show detailed detection reasoning
--interview, -i   Run interactive architecture interview before file-based detection
```

## Workflow

### Step 0: Architecture Interview (--interview only)

When `--interview` flag is provided, conduct an interactive AI interview before file-based detection. This captures human context that file scanning cannot determine.

**Interview flow** (sequential, AI-guided):

1. **프로젝트 유형**: "이 프로젝트는 어떤 종류입니까?"
   → 옵션: web app, REST API, CLI tool, library, monorepo, data pipeline, mobile app

2. **아키텍처 패턴**: "어떤 아키텍처를 따르고 있습니까?"
   → 옵션: microservices, monolith, serverless, event-driven, layered, hexagonal

3. **주요 언어**: "주로 사용하는 프로그래밍 언어는?"
   → 자유 입력, 알려진 에이전트와 매칭

4. **배포 대상**: "어디에 배포합니까?"
   → 옵션: AWS, GCP, Azure, Vercel, on-premises, Docker/K8s, edge

5. **팀 우선순위**: "팀의 주요 관심사는?"
   → 옵션: performance, security, developer experience, cost, scalability

**Interview results feed into Step 1 as weighted detection hints:**
- File evidence + interview agreement = `confidence: high`
- File evidence only = `confidence: medium` (unchanged from current)
- Interview only (no file evidence) = `confidence: suggested`

**Integration with report:**
```
Interview Insights (--interview):
  Project type: REST API (user-specified, confirmed by file scan)
  Architecture: microservices (user-specified)
  Deployment: AWS + Docker (confirmed by file scan)
  Team focus: security → sec-codeql-expert [suggested]

Suggested (from interview, no file evidence):
  ~ sec-codeql-expert  [suggested — no CodeQL config found]
  ~ de-kafka-expert     [suggested — no kafka deps found]
```

### Step 1: Project Scan

Detect tech stack by checking indicator files and dependency manifests.

| Indicator | Files to Check | Agent | Skill |
|-----------|---------------|-------|-------|
| TypeScript | tsconfig.json, *.ts, *.tsx | lang-typescript-expert | typescript-best-practices |
| React/Next.js | next.config.*, package.json (next dep) | fe-vercel-agent | react-best-practices |
| Vue.js | vue.config.*, *.vue | fe-vuejs-agent | - |
| Svelte | svelte.config.*, *.svelte | fe-svelte-agent | - |
| Flutter/Dart | pubspec.yaml, *.dart, lib/main.dart | fe-flutter-agent | - |
| Python | pyproject.toml, requirements.txt, *.py | lang-python-expert | python-best-practices |
| FastAPI | "fastapi" in imports/deps | be-fastapi-expert | fastapi-best-practices |
| Go | go.mod, *.go | lang-golang-expert | go-best-practices |
| Go Backend | go.mod + cmd/ or internal/ dirs | be-go-backend-expert | go-backend-best-practices |
| Rust | Cargo.toml, *.rs | lang-rust-expert | rust-best-practices |
| Kotlin | *.kt, build.gradle.kts | lang-kotlin-expert | kotlin-best-practices |
| Java | *.java, pom.xml | lang-java21-expert | - |
| Spring Boot | spring-boot in deps | be-springboot-expert | springboot-best-practices |
| Express.js | "express" in deps | be-express-expert | - |
| NestJS | "@nestjs" in deps | be-nestjs-expert | - |
| Docker | Dockerfile, compose.yml | infra-docker-expert | docker-best-practices |
| AWS | CDK/SAM/CloudFormation files | infra-aws-expert | aws-best-practices |
| PostgreSQL | *.sql, pg in deps | db-postgres-expert | postgres-best-practices |
| Redis | redis in deps | db-redis-expert | redis-best-practices |
| Supabase | supabase in deps/config | db-supabase-expert | supabase-postgres-best-practices |
| Airflow | dags/*.py, airflow in deps | de-airflow-expert | airflow-best-practices |
| dbt | dbt_project.yml | de-dbt-expert | dbt-best-practices |
| Kafka | kafka in deps/config | de-kafka-expert | kafka-best-practices |
| Spark | spark in deps/config | de-spark-expert | spark-best-practices |
| Snowflake | snowflake in deps/config | de-snowflake-expert | snowflake-best-practices |

**Detection logic:**

```
1. Read package.json / go.mod / Cargo.toml / pyproject.toml / pom.xml
2. Glob for indicator files (tsconfig.json, *.vue, Dockerfile, etc.)
3. Grep dependencies for framework/library names
4. For verbose mode: log each indicator found and confidence level
```

### Step 2: Gap Analysis

Compare detected stack against what is already installed.

```
1. List existing agents:  ls .claude/agents/*.md
2. List existing skills:  find .claude/skills -name "SKILL.md"
3. For each detected indicator:
   a. Check if required agent file exists → mark MISSING or PRESENT
   b. Check if required skill directory exists → mark MISSING or PRESENT
4. Build two lists:
   - missing_agents[]   — agents needed but not present
   - missing_skills[]   — skills needed but not present
5. (Optional) Build unused list for suggestions:
   - Agents present but no indicator matched → flag for review
```

### Step 3: Auto-Configure

Apply changes for all missing items (skip in --dry-run mode).

```
For each missing agent:
  - If agent exists in templates/.claude/agents/ → copy to .claude/agents/
  - Else → delegate to mgr-creator with detected domain context

For each missing skill:
  - If skill exists in templates/.claude/skills/ → copy to .claude/skills/
  - Else → log as "skill not available in templates, manual setup needed"

Rules:
  - Keep all existing rules (they are universal, never remove)

Guides:
  - Verify templates/guides/ directory has relevant reference docs
  - Log missing guide topics as suggestions only (no auto-copy)
```

### Step 4: Report

Output a structured summary after the run.

```
[analysis] Project: <detected project name or path>

Tech Stack Detected:
  - TypeScript (tsconfig.json found)
  - React/Next.js (next in package.json deps)
  - Docker (Dockerfile found)

Agents:
  + lang-typescript-expert  [added]
  + fe-vercel-agent          [added]
  ~ infra-docker-expert      [already present, skipped]

Skills:
  + typescript-best-practices  [added]
  + react-best-practices        [added]
  ~ docker-best-practices       [already present, skipped]

Rules:   no changes (universal rules kept as-is)

Guides:  react/ — present
         docker/ — present
         typescript/ — present

Suggestions:
  - infra-aws-expert not detected (no CDK/SAM files found)
  - de-* agents not detected (no pipeline indicators found)

Summary: 2 agents added, 2 skills added, 0 removed
```

**--dry-run output** prefixes all additions with `[would add]` instead of `[added]` and makes no file changes.

**--verbose output** adds a Detection section before the report:

```
Detection Details:
  tsconfig.json            → TypeScript confirmed
  package.json[next]       → Next.js confirmed (confidence: high)
  package.json[react]      → React confirmed (confidence: high)
  Dockerfile               → Docker confirmed
  no go.mod found          → Go skipped
  no Cargo.toml found      → Rust skipped
```

### Step 5: Adaptive Harness Integration

After analysis completes, offer adaptive-harness optimization:

```
[Analysis Complete] Tech stack detected. Optimize harness for this project?
├── Yes → Run /omcustom:adaptive-harness --optimize (deactivate unused, suggest missing)
├── Dry-run → Run /omcustom:adaptive-harness --optimize --dry-run (show changes only)
└── Skip → Keep current harness configuration
```

If user selects Yes or Dry-run, invoke the adaptive-harness skill with the analysis results as context. The project profile generated by analysis feeds directly into adaptive-harness optimization.

## Integration

| Skill | Integration |
|-------|-------------|
| adaptive-harness | Called after analysis to optimize harness based on detected stack |

## Example Invocation

```
/analysis
/analysis --dry-run
/analysis --verbose
/analysis --dry-run --verbose
```

## Notes

- Always run `--dry-run` first on unfamiliar projects to preview changes
- Agents and skills are additive only — existing items are never removed automatically
- For stacks not in the detection table, delegate to `mgr-creator` for dynamic agent creation
- Rules are never auto-removed; they are project-universal
