---
name: skill-extractor
description: Analyze task trajectories to propose reusable SKILL.md candidates from successful patterns
scope: core
user-invocable: true
argument-hint: "[--threshold <n>] [--dry-run]"
version: 1.0.0
---

# Skill Extractor

Analyze completed task outcomes to identify reusable patterns and propose new SKILL.md candidates. Inspired by Hermes Agent's self-learning skill extraction — adapted for oh-my-customcode's compilation metaphor.

## Philosophy

In the compilation metaphor: task trajectories are runtime traces, and extracted skills are new source code. This skill turns successful execution patterns into reusable knowledge artifacts.

```
Runtime traces (task outcomes) → Pattern analysis → SKILL.md proposal → User approval → mgr-creator
```

## Usage

```
/skill-extractor                    # Analyze current session outcomes
/skill-extractor --threshold 2      # Lower success threshold (default: 3)
/skill-extractor --dry-run          # Preview proposals without writing
```

## Options

```
--threshold, -t   Minimum success count for pattern qualification (default: 3)
--dry-run, -d     Preview proposals to stdout only, no file writes
--all             Include all sessions (not just current, requires task outcome history)
```

## Workflow

### Phase 1: Collect Task Outcomes

Read task outcome data from the session:

```bash
# Current session outcomes (from task-outcome-recorder hook)
OUTCOMES_FILE="/tmp/.claude-task-outcomes-${PPID}"
```

If file doesn't exist or is empty: report "No task outcomes recorded in this session." and stop.

Parse JSONL entries. Each entry has:
```json
{"agent_type": "lang-typescript-expert", "skill": "typescript-best-practices", "description": "Fix type error in auth module", "outcome": "success", "model": "sonnet", "timestamp": "2026-04-05T09:30:00Z", "duration_ms": 15000}
```

### Phase 2: Pattern Detection

Group outcomes by `(agent_type, skill)` tuple:

```
Pattern: (lang-typescript-expert, typescript-best-practices)
  → success: 5, failure: 1, total: 6
  → success_rate: 0.83
  → descriptions: ["Fix type error...", "Refactor module...", ...]
```

Filter qualifying patterns:
- `success_count >= threshold` (default: 3)
- `success_rate >= 0.8`
- Not already an existing skill (check `.claude/skills/*/SKILL.md`)

### Phase 3: Generate Proposals

For each qualifying pattern, generate a SKILL.md proposal:

```markdown
## Proposal: {proposed-skill-name}

**Source Pattern**: {agent_type} + {skill} ({success_count} successes, {success_rate}% rate)
**Confidence**: {low|medium|high} (based on count and rate)

### Proposed SKILL.md

name: {proposed-name}
description: {inferred from common description patterns}
scope: core
user-invocable: false

### Rationale
{Why this pattern should be extracted as a skill — based on frequency and success rate}

### Overlap Check
{List any existing skills with >50% keyword overlap}
```

**Confidence scoring**:
| Successes | Rate | Confidence |
|-----------|------|------------|
| 3-5 | >= 0.8 | low |
| 6-10 | >= 0.85 | medium |
| 10+ | >= 0.9 | high |

### Phase 4: Present to User

Display proposals in ranked order (highest confidence first):

```
[skill-extractor] {N} skill candidates detected

  1. [high] proposed-skill-name
     Source: {agent_type} + {skill} (12 successes, 92%)
     Description: {inferred description}

  2. [medium] another-skill-name
     Source: {agent_type} + {skill} (7 successes, 86%)
     Description: {inferred description}

Select [1-N] to create, "all" to create all, or "skip" to cancel:
```

### Phase 5: Create Skill (on approval)

Delegate to mgr-creator with the proposal context:
- Proposed name and description
- Source pattern data
- Confidence level
- Any overlap warnings

mgr-creator handles: SKILL.md creation, template sync, ontology registration.

## Integration

| System | How |
|--------|-----|
| task-outcome-recorder | Reads JSONL outcomes as input data |
| feedback-collector | Complementary: feedback-collector extracts failure patterns, skill-extractor extracts success patterns |
| mgr-creator | Delegated skill creation on user approval |
| skills-sh-search | Check agentskills.io for existing equivalent before creating |
| R011 (memory) | User Model tracks extraction decisions in Override Decisions |

## Hook Integration

The `skill-extractor-analyzer.sh` Stop hook provides a lightweight pre-analysis:
- Reads task outcomes file
- Counts qualifying patterns
- Emits advisory stderr message if candidates found
- Does NOT create skills (that requires user approval via the skill)

## Safety

- **User approval required**: Never auto-creates skills
- **Overlap check**: Prevents duplicating existing skills
- **Dry-run mode**: Preview without side effects
- **Advisory hook**: Stop hook is advisory-only (exit 0)
- **Confidence transparency**: All proposals show confidence scores
