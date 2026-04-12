# Agent Definition Quality Standards

## Overview

Quality criteria for `.claude/agents/*.md` files. Adapted from ETH Zurich research on LLM-generated agent configurations, modified to fit oh-my-customcode's "create, connect, use" philosophy.

## Core Principle: LLM Generation + Human Verification

> ETH Zurich finding: Purely LLM-generated AGENTS.md files perform worse than human-crafted ones.
>
> oh-my-customcode adaptation: LLM generation is the core workflow (via mgr-creator), but **verification is mandatory**. The creation tool generates; the verification process validates.

| Approach | Status |
|----------|--------|
| Pure LLM generation without review | Not recommended |
| LLM generation + mgr-sauron verification | Required (current workflow) |
| Human-crafted from scratch | Acceptable but not required |

## Four-Section Structure

Every agent file SHOULD contain these conceptual sections:

### 1. STYLE — How the agent communicates

```yaml
# In frontmatter or body
# - Output format preferences
# - Verbosity level (maps to effort: low/medium/high)
# - Language conventions
```

### 2. GOTCHAS — Known pitfalls and edge cases

```markdown
## Known Issues
- This agent cannot handle files larger than X
- Requires MCP server Y to be running
- Output format changes when ecomode is active
```

### 3. ARCH_DECISIONS — Why this agent exists this way

```markdown
## Design Decisions
- Uses sonnet (not opus) because task complexity is moderate
- Skills X and Y are included because they cover the primary workflow
- Memory scope is project (not user) because knowledge is repo-specific
```

### 4. TEST_STRATEGY — How to verify the agent works

```markdown
## Verification
- Run with sample input: `Agent(subagent_type: "this-agent", prompt: "test task")`
- Expected: output matches format X
- Edge case: empty input should return guidance, not error
```

## Frontmatter Quality Checklist

| Field | Required | Quality Check |
|-------|----------|---------------|
| `name` | Yes | Matches filename (kebab-case) |
| `description` | Yes | One line, specific (not generic "handles X") |
| `model` | Yes | Justified by task complexity |
| `tools` | Yes | Minimal set needed (no unnecessary tools) |
| `skills` | No | Referenced skills must exist |
| `domain` | No | Matches actual specialization |
| `limitations` | No | Honest about what agent cannot do |

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Kitchen-sink tools | `tools: [Read, Write, Edit, Bash, Agent, ...]` | Minimal tool set for the role |
| Vague description | "Handles various tasks" | Specific: "Reviews Go code for idiomatic patterns" |
| Copy-paste body | Duplicates guide content | Reference guide, don't copy |
| Missing limitations | Sets unrealistic expectations | Declare what agent cannot do |
| Orphaned skill refs | References non-existent skills | mgr-supplier audit catches this |
| Excessive instructions | 500+ line body with detailed how-to | Move details to skills, keep agent body focused |

## Verification Workflow

```
mgr-creator generates agent
  → mgr-sauron verifies (R017)
    → Frontmatter valid?
    → Skills exist?
    → Tools minimal?
    → Description specific?
  → Human reviews (optional but recommended for complex agents)
  → Agent deployed
```

## Quality Metrics

| Metric | Target |
|--------|--------|
| Body length | 50-200 lines (excluding frontmatter) |
| Tool count | 3-8 (role-appropriate) |
| Skill references | All resolvable |
| Description length | 10-80 characters |
| Limitations declared | At least 1 for complex agents |

## Related

- R006 — Agent design rules (frontmatter format, separation of concerns)
- R017 — Sync verification (mgr-sauron validation)
- `mgr-creator` — Agent creation workflow
- `mgr-supplier` — Dependency audit
