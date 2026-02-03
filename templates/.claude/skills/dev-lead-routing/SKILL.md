---
name: dev-lead-routing
description: Routes development tasks to the correct language or framework expert agent. Use when user requests code review, implementation, refactoring, or debugging.
user-invocable: false
---

# Dev Lead Routing Skill

## Purpose

Routes development tasks to appropriate language and framework expert agents. This skill contains the coordination logic for orchestrating sw-engineer agents across language, frontend, backend, and tooling specializations.

## Engineers Under Management

| Type | Agents | Purpose |
|------|--------|---------|
| sw-engineer/language | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert | Language expertise |
| sw-engineer/frontend | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent | Frontend frameworks |
| sw-engineer/backend | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-nestjs-expert, be-express-expert | Backend frameworks |
| sw-engineer/tooling | tool-npm-expert, tool-optimizer, tool-bun-expert | Build tools and optimization |

## Language/Framework Detection

### File Extension Mapping

| Extension | Agent | Language/Framework |
|-----------|-------|-------------------|
| `.go` | lang-golang-expert | Go |
| `.py` | lang-python-expert | Python |
| `.rs` | lang-rust-expert | Rust |
| `.kt`, `.kts` | lang-kotlin-expert | Kotlin |
| `.ts`, `.tsx` | lang-typescript-expert | TypeScript |
| `.java` | lang-java21-expert | Java |
| `.js`, `.jsx` (React) | fe-vercel-agent | React/Next.js |
| `.vue` | fe-vuejs-agent | Vue.js |
| `.svelte` | fe-svelte-agent | Svelte |

### Keyword Mapping

| Keyword | Agent |
|---------|-------|
| "go", "golang" | lang-golang-expert |
| "python", "py" | lang-python-expert |
| "rust" | lang-rust-expert |
| "kotlin" | lang-kotlin-expert |
| "typescript", "ts" | lang-typescript-expert |
| "java" | lang-java21-expert |
| "react", "next.js", "vercel" | fe-vercel-agent |
| "vue" | fe-vuejs-agent |
| "svelte" | fe-svelte-agent |
| "fastapi" | be-fastapi-expert |
| "spring", "springboot" | be-springboot-expert |
| "nestjs" | be-nestjs-expert |
| "express" | be-express-expert |
| "npm" | tool-npm-expert |
| "optimize", "bundle" | tool-optimizer |
| "bun" | tool-bun-expert |

## Command Routing

```
Development Request → Detection → Expert Agent

Go code     → lang-golang-expert
Python code → lang-python-expert
TypeScript  → lang-typescript-expert
FastAPI     → be-fastapi-expert
Multi-lang  → Multiple experts (parallel)
```

## Routing Rules

### 1. Code Review Workflow

```
1. Receive review request
2. Identify file types and languages:
   - Use Glob to find files
   - Parse file extensions
   - Detect framework (package.json, go.mod, etc.)
3. Select appropriate experts
4. Distribute files to experts (parallel if 2+ languages)
5. Aggregate review findings
6. Present unified report
```

Example:
```
User: "Review src/*.go src/*.py src/*.ts"

Detection:
  - src/*.go → lang-golang-expert
  - src/*.py → lang-python-expert
  - src/*.ts → lang-typescript-expert

Route (parallel):
  Task(lang-golang-expert role → review src/*.go, model: "sonnet")
  Task(lang-python-expert role → review src/*.py, model: "sonnet")
  Task(lang-typescript-expert role → review src/*.ts, model: "sonnet")

Aggregate:
  Go: 2 issues found
  Python: Clean
  TypeScript: 5 suggestions
```

### 2. Feature Implementation Workflow

```
1. Analyze feature requirements
2. Identify affected components:
   - Backend API → backend expert
   - Frontend UI → frontend expert
   - Multiple layers → multiple experts
3. Select required experts
4. Coordinate implementation (sequential if dependent, parallel if independent)
5. Ensure consistency across languages
6. Report completion status
```

### 3. Multi-Language Projects

For projects with multiple languages:

```
1. Detect all languages in project
2. Identify primary language (most files)
3. Route to appropriate experts:
   - If task spans multiple languages → parallel experts
   - If task is language-specific → single expert
4. Coordinate cross-language consistency
```

## Sub-agent Model Selection

### Model Mapping by Task Type

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Architecture analysis | `opus` | Deep reasoning required |
| Code review | `sonnet` | Balanced quality judgment |
| Code implementation | `sonnet` | Standard code generation |
| Refactoring | `sonnet` | Balanced transformation |
| Quick validation | `haiku` | Fast response |
| File search | `haiku` | Simple operation |

### Model Mapping by Agent

| Agent Type | Default Model | Alternative |
|------------|---------------|-------------|
| Language experts | `sonnet` | `opus` for architecture |
| Frontend experts | `sonnet` | `haiku` for quick checks |
| Backend experts | `sonnet` | `opus` for API design |
| Tooling experts | `haiku` | `sonnet` for complex configs |

### Task Call Examples

```
# Complex architecture analysis
Task(
  subagent_type: "general-purpose",
  prompt: "Analyze module dependencies and suggest improvements for src/",
  model: "opus"
)

# Standard code review
Task(
  subagent_type: "general-purpose",
  prompt: "Review Go code in src/handlers/ following lang-golang-expert guidelines",
  model: "sonnet"
)

# Quick file search
Task(
  subagent_type: "Explore",
  prompt: "Find all files importing auth package",
  model: "haiku"
)
```

## Parallel Execution

Following R009:
- Maximum 4 parallel instances
- Only worker agents (sw-engineer/*)
- Independent file/module reviews
- Coordinate cross-expert consistency

Example:
```
User: "Review all backend APIs"

Detection:
  - src/api/go/ → lang-golang-expert
  - src/api/python/ → lang-python-expert
  - src/api/kotlin/ → lang-kotlin-expert

Route (parallel):
  Task(lang-golang-expert role → review src/api/go/, model: "sonnet")
  Task(lang-python-expert role → review src/api/python/, model: "sonnet")
  Task(lang-kotlin-expert role → review src/api/kotlin/, model: "sonnet")
```

## Display Format

```
[Analyzing] Detected: Go, Python, TypeScript

[Delegating] lang-golang-expert:sonnet → 5 Go files
[Delegating] lang-python-expert:sonnet → 3 Python files
[Delegating] lang-typescript-expert:sonnet → 8 TypeScript files

[Progress] ███████████░ 2/3 experts completed

[Summary]
  Go: 2 issues found
  Python: Clean
  TypeScript: 5 suggestions

Review completed.
```

## Integration with Other Agents

- Receives requirements from arch-speckit-agent (sw-architect)
- Reports to qa-lead for quality assurance
- Coordinates with tooling experts (tool-npm-expert, tool-optimizer) for build/deploy

## Usage

This skill is NOT user-invocable. It should be automatically triggered when the main conversation detects development intent.

Detection criteria:
- User requests code review
- User mentions language/framework name
- User provides file paths for review
- User requests refactoring/implementation
- User uses dev:* commands
