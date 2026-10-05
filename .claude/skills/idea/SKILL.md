---
name: idea
description: Analyze a natural language idea against the project codebase and return structured issue specs
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<idea text>"
---

# /idea — Natural Language Idea Analysis

Analyze a natural language idea against the current project's codebase, assess feasibility, scope, and return structured JSON for issue creation.

## Usage

```
/idea Add OAuth login with Google and GitHub providers
/idea 디스코드 봇에 모니터링 대시보드 추가
```

## Workflow

### Phase 1: Parse Input

Extract the core intent from the natural language input.

### Phase 2: Codebase Analysis

1. `Glob` and `Grep` to understand current project structure
2. Identify relevant modules, files, and patterns
3. Check for existing similar functionality or conflicts

### Phase 3: Feasibility Analysis

Analyze using a sonnet agent:

Pass `mode: "bypassPermissions"` on Agent calls for compatibility: it is required on CC < 2.1.212 (the per-call default, `acceptEdits`, overrides agent frontmatter `permissionMode`) and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (adjustable via agent frontmatter `permissionMode`). Verify the effective mode before unattended runs: see R010 "Universal bypassPermissions".

- **Scope**: Which modules/files would be affected
- **Complexity**: XS/S/M/L effort estimate
- **Dependencies**: What existing code needs to change
- **Risks**: Potential breaking changes or conflicts

### Phase 4: Output

Return a JSON block with the analysis:

```json
{
  "title": "concise feature title",
  "scope": "affected modules and files",
  "estimatedIssues": 3,
  "details": "2-3 sentence feasibility analysis",
  "issueSpecs": [
    {
      "title": "issue title",
      "body": "issue description with acceptance criteria",
      "labels": ["enhancement"]
    }
  ]
}
```

The JSON block MUST be wrapped in triple backtick json fence for parsing.

## Model Selection

| Phase | Model | Rationale |
|-------|-------|-----------|
| Phase 1-2 | orchestrator | Simple read/search |
| Phase 3 | sonnet | Balanced analysis |

## Integration

| Rule | How |
|------|-----|
| R009 | Single agent for analysis |
| R010 | Orchestrator manages phases; analysis delegated to an agent (permission mode per R010 "Universal bypassPermissions") |

## Output Format

The output MUST contain a fenced JSON block that can be parsed by the calling system (e.g., builder-factory Discord bot). The JSON structure is the contract — do not change field names.
